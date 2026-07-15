import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type {
  Invitation,
  InvitationStatus,
  WorkspaceSummary,
} from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";

// Founder invitations only (infra/database/migrations/0001_aidb_v5_baseline.sql
// section 6). Mentor invitations are workspace-bound and belong to a later
// PR (4.1) — every query here is deliberately scoped with
// `invite_role = 'founder'` so this module can never touch a mentor row.
const FOUNDER_INVITATION_TTL_DAYS = 7;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// randomBytes(32).toString("base64url") always produces exactly 43
// characters (256 bits, no padding) — anchoring the length catches
// corrupted/truncated tokens before they ever reach a database query.
const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const WORKSPACE_SLUG_BASE_MAX_LENGTH = 40;
const MAX_WORKSPACE_SLUG_ATTEMPTS = 3; // initial attempt + up to 2 retries

interface InvitationRow {
  id: string;
  email: string;
  invite_role: "founder" | "mentor";
  workspace_id: string | null;
  token_hash: string;
  invited_by_user_id: string | null;
  invited_user_id: string | null;
  status: InvitationStatus;
  personal_message: string | null;
  expires_at: Date;
  accepted_by_user_id: string | null;
  accepted_at: Date | null;
  revoked_by_user_id: string | null;
  revoked_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface UserRow {
  id: string;
  email: string;
  role: "pending" | "founder" | "mentor" | "admin";
  deleted_at: Date | null;
}

interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
}

function mapInvitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    email: row.email,
    inviteRole: row.invite_role,
    workspaceId: row.workspace_id,
    status: row.status,
    invitedByUserId: row.invited_by_user_id,
    personalMessage: row.personal_message,
    expiresAt: row.expires_at.toISOString(),
    acceptedAt: row.accepted_at?.toISOString() ?? null,
    revokedAt: row.revoked_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// A thin structural guard over `unknown` catch values — avoids an unchecked
// cast at every call site that needs to inspect a Postgres error code.
function isPostgresError(
  error: unknown,
): error is { code: string; constraint?: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  );
}

// Runtime validation of untrusted input crossing the API boundary — the
// TypeScript parameter types below only describe the happy path; a caller
// can still send `{ email: 123 }` over JSON, and TypeScript cannot stop
// that at runtime.
function validateCreateInvitationInput(
  input: unknown,
): asserts input is { email: string; personalMessage?: string } {
  if (
    typeof input !== "object" ||
    input === null ||
    !("email" in input) ||
    typeof (input as { email: unknown }).email !== "string"
  ) {
    throw new ServiceError("VALIDATION_ERROR", "Email must be a string.");
  }

  const { email, personalMessage } = input as {
    email: string;
    personalMessage?: unknown;
  };

  const trimmed = email.trim();
  if (trimmed.length === 0 || !trimmed.includes("@") || trimmed.length > 320) {
    throw new ServiceError("VALIDATION_ERROR", "Email must be a valid address.");
  }

  if (
    personalMessage !== undefined &&
    (typeof personalMessage !== "string" || personalMessage.length > 2000)
  ) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "Personal message must be a string of at most 2000 characters.",
    );
  }
}

function assertValidInvitationId(invitationId: string): void {
  if (!UUID_PATTERN.test(invitationId)) {
    throw new ServiceError("VALIDATION_ERROR", "Invitation ID is invalid.");
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Founders paste this by hand from wherever the token was shared — trimming
// before both the format check and the hash means accidental leading/
// trailing whitespace never turns a valid token into a lookup miss.
function normalizeAndValidateInvitationToken(rawToken: unknown): string {
  if (typeof rawToken !== "string") {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "Invitation token must be a string.",
    );
  }

  const token = rawToken.trim();
  if (!INVITATION_TOKEN_PATTERN.test(token)) {
    throw new ServiceError("VALIDATION_ERROR", "Invitation token is invalid.");
  }

  return token;
}

// The only caller of this today is acceptFounderInvitation below — Workspace
// renaming/creation UX belongs to a future PR (1.3's WorkspaceService does
// not create Workspaces, only Ventures within one), so this intentionally
// stays private and minimal rather than anticipating that shape.
function defaultWorkspaceDetails(email: string): {
  name: string;
  base: string;
} {
  const localPart = email.split("@")[0]?.trim() ?? "";
  const sanitized = localPart
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = (sanitized || "founder").slice(
    0,
    WORKSPACE_SLUG_BASE_MAX_LENGTH,
  );

  return { name: `${localPart || "Founder"}'s Workspace`, base };
}

// `workspaces_slug_unique` is a plain (non-partial) unique constraint, so
// `on conflict (slug) do nothing` never aborts the transaction the way a
// raised 23505 would — a slug collision here just returns zero rows and this
// loop tries again with a fresh suffix. A real 23505 on
// `workspaces_founder_unique` is a different constraint entirely, is not
// absorbed by this ON CONFLICT target, and propagates to the caller's catch
// block for a full transaction rollback.
async function insertWorkspaceWithRetry(
  client: PoolClient,
  founderUserId: string,
  email: string,
  createSuffix: () => string,
): Promise<WorkspaceRow> {
  const { name, base } = defaultWorkspaceDetails(email);

  for (let attempt = 0; attempt < MAX_WORKSPACE_SLUG_ATTEMPTS; attempt++) {
    const slug = `${base}-${createSuffix()}`;
    const result = await client.query<WorkspaceRow>(
      `insert into workspaces (founder_user_id, name, slug)
       values ($1, $2, $3)
       on conflict (slug) do nothing
       returning id, name, slug`,
      [founderUserId, name, slug],
    );
    if (result.rows[0]) {
      return result.rows[0];
    }
  }

  throw new Error(
    "Exhausted workspace slug retry attempts — this indicates a broken " +
      "suffix generator, not normal random-collision odds.",
  );
}

// The partial unique index only filters on
// `status = 'pending' AND invite_role = 'founder'` — it does not check
// `expires_at`. Without this, a 7-day-stale invitation would stay
// `status='pending'` forever, blocking a legitimate re-invite and showing up
// as "pending" in the list indefinitely. Called inside every mutating/listing
// transaction below; never exposed outside this module.
async function expireStaleFounderInvitations(
  client: PoolClient,
  email?: string,
): Promise<void> {
  await client.query(
    `update invitations
     set status = 'expired', updated_at = now()
     where invite_role = 'founder'
       and status = 'pending'
       and expires_at <= now()
       and ($1::text is null or lower(trim(email)) = lower(trim($1)))`,
    [email ?? null],
  );
}

async function lockFounderInvitation(
  client: PoolClient,
  invitationId: string,
): Promise<InvitationRow | undefined> {
  const result = await client.query<InvitationRow>(
    `select * from invitations
     where id = $1 and invite_role = 'founder'
     for update`,
    [invitationId],
  );
  return result.rows[0];
}

export async function createFounderInvitation(
  actor: ActorContext,
  input: { email: string; personalMessage?: string },
): Promise<{ invitation: Invitation; rawToken: string }> {
  assertRole(actor, ["admin"]);
  validateCreateInvitationInput(input);

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  const client = await pool.connect();
  try {
    await client.query("begin");

    await expireStaleFounderInvitations(client, input.email);

    const result = await client.query<InvitationRow>(
      `insert into invitations
         (email, invite_role, token_hash, invited_by_user_id, expires_at, personal_message)
       values
         ($1, 'founder', $2, $3, now() + ($4 * interval '1 day'), $5)
       returning *`,
      [
        input.email,
        tokenHash,
        actor.userId,
        FOUNDER_INVITATION_TTL_DAYS,
        input.personalMessage ?? null,
      ],
    );

    await client.query("commit");

    return { invitation: mapInvitation(result.rows[0]), rawToken };
  } catch (error) {
    // The transaction is aborted the moment `23505` is raised — every
    // statement on this connection would fail until `rollback`, so it must
    // happen before the error is inspected/mapped, not after.
    await client.query("rollback");

    if (
      isPostgresError(error) &&
      error.code === "23505" &&
      error.constraint === "invitations_pending_founder_unique"
    ) {
      throw new ServiceError(
        "INVITATION_ALREADY_PENDING",
        "A pending Founder invitation already exists for this email.",
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function revokeFounderInvitation(
  actor: ActorContext,
  invitationId: string,
): Promise<Invitation> {
  assertRole(actor, ["admin"]);
  assertValidInvitationId(invitationId);

  const client = await pool.connect();
  // Committing and then throwing from inside the same try is unsafe — the
  // catch block would call `rollback` on an already-committed transaction.
  // The "stale pending -> expired" branch below defers its error until
  // after the try/catch/finally has fully resolved.
  let deferredError: ServiceError | undefined;
  let invitation: Invitation | undefined;

  try {
    await client.query("begin");

    const row = await lockFounderInvitation(client, invitationId);

    if (!row) {
      throw new ServiceError("NOT_FOUND", "Invitation not found.");
    } else if (row.status === "pending" && row.expires_at <= new Date()) {
      await client.query(
        `update invitations
         set status = 'expired'
         where id = $1 and invite_role = 'founder' and status = 'pending'`,
        [invitationId],
      );
      deferredError = new ServiceError(
        "INVITATION_NOT_PENDING",
        "The invitation has expired and can no longer be revoked.",
      );
    } else if (row.status !== "pending") {
      throw new ServiceError(
        "INVITATION_NOT_PENDING",
        "The invitation is no longer pending.",
      );
    } else {
      // Defensively repeats invite_role/status even though the row above is
      // already locked and known-good — belt-and-suspenders against a
      // future refactor accidentally dropping the guard.
      const result = await client.query<InvitationRow>(
        `update invitations
         set status = 'revoked', revoked_by_user_id = $1, revoked_at = now()
         where id = $2 and invite_role = 'founder' and status = 'pending'
         returning *`,
        [actor.userId, invitationId],
      );
      invitation = mapInvitation(result.rows[0]);
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  if (deferredError) {
    throw deferredError;
  }
  return invitation!;
}

export interface AcceptInvitationDependencies {
  // Test-only seam: production always uses randomBytes(3).toString("hex").
  // Deterministic sequences let tests force a real slug collision instead of
  // relying on random-collision odds.
  createWorkspaceSuffix?: () => string;
}

// Implements the single-transaction contract documented at the top of
// infra/database/migrations/0001_aidb_v5_baseline.sql (section 7): lock the
// Invitation → check pending/not-expired → normalize and compare email →
// upgrade role → create the Founder's Workspace → write accepted fields →
// revoke other pending Invitations for the same email. No intermediate
// state (accepted-but-still-pending-role, role-upgraded-but-no-Workspace)
// is ever observable outside this function.
export async function acceptFounderInvitation(
  actor: ActorContext,
  rawToken: unknown,
  deps: AcceptInvitationDependencies = {},
): Promise<{ invitation: Invitation; workspace: WorkspaceSummary }> {
  // Fast-fail on the (possibly stale) session role before opening a
  // connection at all. This is not the authoritative check — the database
  // row locked further down is re-validated against the real, current role.
  assertRole(actor, ["pending"]);

  const token = normalizeAndValidateInvitationToken(rawToken);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const createSuffix =
    deps.createWorkspaceSuffix ?? (() => randomBytes(3).toString("hex"));

  const client = await pool.connect();
  // Same deferred-error pattern as revokeFounderInvitation: the "expired"
  // branch must commit (the expiry write is real and should stick), so its
  // error can only be thrown after the shared commit below, never from
  // inside a branch that would otherwise trigger the catch block's rollback.
  let deferredError: ServiceError | undefined;
  let invitation: Invitation | undefined;
  let workspace: WorkspaceSummary | undefined;

  try {
    await client.query("begin");

    // Unlocked peek: just enough to know which row and which email to lock.
    // `invite_role = 'founder'` here is what stops a Mentor token from ever
    // being usable on this endpoint — it simply won't be found.
    const peeked = await client.query<{ id: string; email: string }>(
      `select id, email from invitations
       where token_hash = $1 and invite_role = 'founder'`,
      [tokenHash],
    );
    const peekedInvitation = peeked.rows[0];
    if (!peekedInvitation) {
      throw new ServiceError("NOT_FOUND", "Founder invitation not found.");
    }

    // Lock every Invitation for this email, in a stable order, in one shot.
    // This fixes the lock order (email family, ascending id, then the User
    // row) that PR 4.1's Mentor acceptance must also follow — two acceptance
    // transactions racing on the same email can never form a deadlock cycle
    // if both always acquire locks in this same order.
    const familyResult = await client.query<InvitationRow>(
      `select * from invitations
       where lower(trim(email)) = lower(trim($1))
       order by id
       for update`,
      [peekedInvitation.email],
    );

    // Re-locate the target inside the now-locked set rather than trusting
    // the unlocked peek. Under today's mutation surface neither token_hash
    // nor invite_role is ever written after insert, so this specific branch
    // is not reachable by any test fixture without corrupting a row
    // directly — it documents/guards the invariant for whoever writes the
    // Mentor equivalent in PR 4.1, rather than trusting the peek blindly.
    const target = familyResult.rows.find(
      (row) =>
        row.id === peekedInvitation.id &&
        row.token_hash === tokenHash &&
        row.invite_role === "founder",
    );
    if (!target) {
      throw new ServiceError("NOT_FOUND", "Founder invitation not found.");
    }

    // `invitations_workspace_target_check` already guarantees this for every
    // Founder Invitation, pending or accepted — this is a data-corruption
    // trip wire, not a normal business error.
    if (target.workspace_id !== null) {
      throw new Error(
        `Founder invitation ${target.id} unexpectedly has a non-null workspace_id.`,
      );
    }

    if (target.status !== "pending") {
      throw new ServiceError(
        "INVITATION_NOT_PENDING",
        "The invitation is no longer pending.",
      );
    }

    if (target.expires_at <= new Date()) {
      await client.query(
        `update invitations
         set status = 'expired'
         where id = $1 and invite_role = 'founder' and status = 'pending'`,
        [target.id],
      );
      deferredError = new ServiceError(
        "INVITATION_NOT_PENDING",
        "The invitation has expired and can no longer be accepted.",
      );
    } else {
      const userResult = await client.query<UserRow>(
        `select id, email, role, deleted_at from users where id = $1 for update`,
        [actor.userId],
      );
      const user = userResult.rows[0];

      if (!user || user.deleted_at !== null || user.role !== "pending") {
        throw new ServiceError(
          "FORBIDDEN",
          "Only an account awaiting invitation acceptance can accept this invitation.",
        );
      }

      if (normalizeEmail(user.email) !== normalizeEmail(target.email)) {
        throw new ServiceError(
          "INVITATION_EMAIL_MISMATCH",
          "This invitation was issued to a different email address.",
        );
      }

      // Conditional update, not a bare UPDATE by id — this is the
      // authoritative guard against a stale/replayed ActorContext: if the
      // row's role has already moved on since the `for update` lock was
      // taken (which cannot actually happen within this same transaction,
      // but would if this logic is ever copied outside a single
      // transaction), zero rows come back and the whole accept aborts.
      const roleUpdate = await client.query(
        `update users
         set role = 'founder'
         where id = $1 and role = 'pending' and deleted_at is null
         returning id`,
        [actor.userId],
      );
      if (roleUpdate.rowCount === 0) {
        throw new ServiceError(
          "FORBIDDEN",
          "Only an account awaiting invitation acceptance can accept this invitation.",
        );
      }

      const createdWorkspace = await insertWorkspaceWithRetry(
        client,
        actor.userId,
        target.email,
        createSuffix,
      );

      // workspace_id stays null — see the badShape guard above; the
      // relationship is Invitation.invited_user_id → Workspace.founder_user_id,
      // not a column on invitations.
      const acceptedResult = await client.query<InvitationRow>(
        `update invitations
         set status = 'accepted', invited_user_id = $1, accepted_by_user_id = $1, accepted_at = now()
         where id = $2 and invite_role = 'founder' and status = 'pending'
         returning *`,
        [actor.userId, target.id],
      );

      // Two statements, not one, so a same-email Invitation that merely
      // expired naturally is never recorded as if an admin/Founder revoked
      // it (revoked_by_user_id must stay null for a natural expiry).
      await client.query(
        `update invitations
         set status = 'expired'
         where id <> $1
           and lower(trim(email)) = lower(trim($2))
           and status = 'pending'
           and expires_at <= now()`,
        [target.id, target.email],
      );

      // Whatever is still pending at this point is, by definition, not yet
      // expired — deliberately not scoped to invite_role = 'founder' (per
      // the schema comment: "revoke other pending Invitations for the same
      // email"), so a same-email pending Mentor invitation is revoked too.
      await client.query(
        `update invitations
         set status = 'revoked', revoked_by_user_id = $1, revoked_at = now()
         where id <> $2
           and lower(trim(email)) = lower(trim($3))
           and status = 'pending'`,
        [actor.userId, target.id, target.email],
      );

      invitation = mapInvitation(acceptedResult.rows[0]);
      workspace = createdWorkspace;
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");

    if (
      isPostgresError(error) &&
      error.code === "23505" &&
      error.constraint === "workspaces_founder_unique"
    ) {
      throw new ServiceError(
        "FOUNDER_WORKSPACE_ALREADY_EXISTS",
        "This account already has a Workspace.",
      );
    }

    throw error;
  } finally {
    client.release();
  }

  if (deferredError) {
    throw deferredError;
  }
  return { invitation: invitation!, workspace: workspace! };
}

export async function listFounderInvitations(
  actor: ActorContext,
): Promise<Invitation[]> {
  assertRole(actor, ["admin"]);

  const client = await pool.connect();
  try {
    await client.query("begin");

    // A data-modifying CTE and a statement reading it share the same
    // snapshot in Postgres — the outer query is not guaranteed to see the
    // CTE's own update. Two statements in one transaction guarantee it.
    await expireStaleFounderInvitations(client);

    const result = await client.query<InvitationRow>(
      `select * from invitations
       where invite_role = 'founder'
       order by created_at desc, id desc`,
    );

    await client.query("commit");

    return result.rows.map(mapInvitation);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
