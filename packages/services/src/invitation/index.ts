import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type {
  Invitation,
  InvitationListItem,
  InvitationStatus,
  Venture,
  WorkspaceStatus,
  WorkspaceSummary,
} from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { slugifyBase } from "@ai-catalyst/services/internal/slug";
import { createDefaultVentureForNewWorkspace } from "@ai-catalyst/services/venture";
import { setInitialActiveContext } from "@ai-catalyst/services/workspace/active-context";

// Both Invitation roles live here rather than in a parallel mentor module,
// because acceptance is not separable by role: `acceptFounderInvitation`
// locks the entire email family — every Invitation for that address,
// whatever its `invite_role` — and revokes the losers. Two accept paths
// that each locked "their own" rows would be exactly the race that locking
// the whole family exists to prevent. So every query below states its
// `invite_role` explicitly, and the two accept functions share one locking
// order.
//
// Who may issue what:
//   founder  <- Admin or Mentor. A Mentor-issued one attributes the
//               resulting Workspace to that Mentor (see acceptFounderInvitation).
//   mentor   <- Admin only, and platform-level (workspace_id null): the
//               Mentor exists before any of the Workspaces they will cover.
const INVITATION_TTL_DAYS = 7;

type InviteRole = "founder" | "mentor";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// randomBytes(32).toString("base64url") always produces exactly 43
// characters (256 bits, no padding) — anchoring the length catches
// corrupted/truncated tokens before they ever reach a database query.
const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

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
  status: WorkspaceStatus;
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
    throw new ServiceError(
      "VALIDATION_ERROR",
      "Email must be a valid address.",
    );
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
// renaming/creation UX doesn't exist yet (WorkspaceService only creates
// Ventures within an existing Workspace), so this intentionally stays
// private and minimal rather than anticipating that shape.
function defaultWorkspaceDetails(email: string): {
  name: string;
  base: string;
} {
  const localPart = email.split("@")[0]?.trim() ?? "";
  const base = slugifyBase(localPart, "founder");

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
  mentorUserId: string | null,
): Promise<WorkspaceRow> {
  const { name, base } = defaultWorkspaceDetails(email);

  for (let attempt = 0; attempt < MAX_WORKSPACE_SLUG_ATTEMPTS; attempt++) {
    const slug = `${base}-${createSuffix()}`;
    const result = await client.query<WorkspaceRow>(
      `insert into workspaces (founder_user_id, name, slug, mentor_user_id)
       values ($1, $2, $3, $4)
       on conflict (slug) do nothing
       returning id, name, slug, status`,
      [founderUserId, name, slug, mentorUserId],
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

// Neither pending-unique index checks `expires_at` — both filter only on
// `status = 'pending'` and the role. Without this, a 7-day-stale invitation
// would stay `status='pending'` forever, blocking a legitimate re-invite and
// showing up as "pending" in the list indefinitely. Called inside every
// mutating/listing transaction below; never exposed outside this module.
async function expireStaleInvitations(
  client: PoolClient,
  inviteRole: InviteRole,
  email?: string,
): Promise<void> {
  await client.query(
    `update invitations
     set status = 'expired', updated_at = now()
     where invite_role = $1
       and status = 'pending'
       and expires_at <= now()
       and ($2::text is null or lower(trim(email)) = lower(trim($2)))`,
    [inviteRole, email ?? null],
  );
}

async function lockInvitation(
  client: PoolClient,
  invitationId: string,
  inviteRole: InviteRole,
): Promise<InvitationRow | undefined> {
  const result = await client.query<InvitationRow>(
    `select * from invitations
     where id = $1 and invite_role = $2
     for update`,
    [invitationId, inviteRole],
  );
  return result.rows[0];
}

// A Mentor may only act on Invitations they personally sent; an Admin is
// unscoped. Safe to evaluate against an already-fetched row rather than as a
// WHERE clause: `invited_by_user_id` is set at insert and never updated, and
// every caller has the row under `for update` before asking.
//
// NOT_FOUND rather than FORBIDDEN — telling one Mentor that another Mentor's
// invitation exists is an enumeration oracle over a colleague's Founder
// pipeline. It also keeps the response identical to a genuinely absent id.
function assertActorOwnsInvitation(
  actor: ActorContext,
  row: InvitationRow,
): void {
  if (actor.role === "mentor" && row.invited_by_user_id !== actor.userId) {
    throw new ServiceError("NOT_FOUND", "Invitation not found.");
  }
}

async function createInvitation(
  actor: ActorContext,
  inviteRole: InviteRole,
  input: { email: string; personalMessage?: string },
): Promise<{ invitation: Invitation; rawToken: string }> {
  validateCreateInvitationInput(input);

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  const client = await pool.connect();
  try {
    await client.query("begin");

    await expireStaleInvitations(client, inviteRole, input.email);

    // workspace_id is always null: a Founder Invitation has no Workspace yet
    // (the acceptance creates it), and a Mentor Invitation here is
    // platform-level. Both shapes satisfy
    // `invitations_workspace_target_check` as relaxed by migration 0010.
    const result = await client.query<InvitationRow>(
      `insert into invitations
         (email, invite_role, token_hash, invited_by_user_id, expires_at, personal_message)
       values
         ($1, $2, $3, $4, now() + ($5 * interval '1 day'), $6)
       returning *`,
      [
        input.email,
        inviteRole,
        tokenHash,
        actor.userId,
        INVITATION_TTL_DAYS,
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

    const pendingUniqueConstraint =
      inviteRole === "founder"
        ? "invitations_pending_founder_unique"
        : "invitations_pending_mentor_unique";

    if (
      isPostgresError(error) &&
      error.code === "23505" &&
      error.constraint === pendingUniqueConstraint
    ) {
      throw new ServiceError(
        "INVITATION_ALREADY_PENDING",
        inviteRole === "founder"
          ? "A pending Founder invitation already exists for this email."
          : "A pending Mentor invitation already exists for this email.",
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

// A Mentor issuing this is what binds the resulting Workspace to them —
// `invited_by_user_id` is the only record of the intended relationship, and
// acceptFounderInvitation reads it back to set `workspaces.mentor_user_id`.
// An Admin-issued invitation produces an unmentored Workspace.
export async function createFounderInvitation(
  actor: ActorContext,
  input: { email: string; personalMessage?: string },
): Promise<{ invitation: Invitation; rawToken: string }> {
  assertRole(actor, ["admin", "mentor"]);
  return createInvitation(actor, "founder", input);
}

// Admin-only, and deliberately not something a Mentor can do: letting Mentors
// recruit Mentors would make the platform's roster self-propagating with no
// gatekeeper. The resulting invitation is platform-level — accepting it makes
// someone a Mentor covering nothing yet, and they grow their own roster by
// inviting Founders.
export async function createMentorInvitation(
  actor: ActorContext,
  input: { email: string; personalMessage?: string },
): Promise<{ invitation: Invitation; rawToken: string }> {
  assertRole(actor, ["admin"]);
  return createInvitation(actor, "mentor", input);
}

async function revokeInvitation(
  actor: ActorContext,
  inviteRole: InviteRole,
  invitationId: string,
): Promise<Invitation> {
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

    const row = await lockInvitation(client, invitationId, inviteRole);

    if (!row) {
      throw new ServiceError("NOT_FOUND", "Invitation not found.");
    }
    assertActorOwnsInvitation(actor, row);

    if (row.status === "pending" && row.expires_at <= new Date()) {
      await client.query(
        `update invitations
         set status = 'expired'
         where id = $1 and invite_role = $2 and status = 'pending'`,
        [invitationId, inviteRole],
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
         where id = $2 and invite_role = $3 and status = 'pending'
         returning *`,
        [actor.userId, invitationId, inviteRole],
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

// A Mentor may revoke only the Founder Invitations they sent themselves;
// an Admin may revoke any (see assertActorOwnsInvitation).
export async function revokeFounderInvitation(
  actor: ActorContext,
  invitationId: string,
): Promise<Invitation> {
  assertRole(actor, ["admin", "mentor"]);
  return revokeInvitation(actor, "founder", invitationId);
}

export async function revokeMentorInvitation(
  actor: ActorContext,
  invitationId: string,
): Promise<Invitation> {
  assertRole(actor, ["admin"]);
  return revokeInvitation(actor, "mentor", invitationId);
}

export interface AcceptInvitationDependencies {
  // Test-only seam: production always uses randomBytes(3).toString("hex").
  // Deterministic sequences let tests force a real slug collision instead of
  // relying on random-collision odds.
  createWorkspaceSuffix?: () => string;
  createVentureSuffix?: () => string;
}

/**
 * Decides the new Workspace's Mentor from whoever sent the Invitation.
 *
 * Read at acceptance time, not trusted from issue time: an Invitation can sit
 * for seven days, and the inviter may have been demoted or had their account
 * closed in between. Attributing a Founder to someone who is no longer a
 * Mentor would hand them a supervisory view they are no longer entitled to,
 * so anything other than a live Mentor yields null — an unmentored Workspace,
 * exactly as an Admin-issued invitation produces. Admin can bind one later.
 *
 * Deliberately not `for update`. The acceptor's own users row is already
 * locked by the caller, and taking a second users lock in an order this
 * function cannot control is how a deadlock gets built; a demotion committing
 * a moment after this read is a pre-existing state to reconcile in whatever
 * ships role changes, not a race this transaction can meaningfully win.
 */
async function resolveInvitingMentorUserId(
  client: PoolClient,
  invitedByUserId: string | null,
): Promise<string | null> {
  // Older invitations, and any created by a system path, may have no inviter.
  if (!invitedByUserId) {
    return null;
  }

  const result = await client.query<{ role: string; deleted_at: Date | null }>(
    `select role, deleted_at from users where id = $1`,
    [invitedByUserId],
  );

  const row = result.rows[0];
  if (!row || row.deleted_at !== null || row.role !== "mentor") {
    return null;
  }

  return invitedByUserId;
}

// Single-transaction contract: lock the Invitation → check
// pending/not-expired → normalize and compare email → upgrade role →
// create the Founder's Workspace, attributed to the inviting Mentor if there
// was one (resolveInvitingMentorUserId) → create the Founder's default Venture
// (MVP: exactly one per Founder, see createDefaultVentureForNewWorkspace) →
// make that Venture the active selection → write accepted fields → revoke
// other pending Invitations for the same email. No intermediate state
// (accepted-but-still-pending-role, role-upgraded-but-no-Workspace/Venture,
// Venture-created-but-not-yet-active) is ever observable outside this
// function.
export async function acceptFounderInvitation(
  actor: ActorContext,
  rawToken: unknown,
  deps: AcceptInvitationDependencies = {},
): Promise<{
  invitation: Invitation;
  workspace: WorkspaceSummary;
  venture: Venture;
}> {
  // Fast-fail on the (possibly stale) session role before opening a
  // connection at all. This is not the authoritative check — the database
  // row locked further down is re-validated against the real, current role.
  assertRole(actor, ["pending"]);

  const token = normalizeAndValidateInvitationToken(rawToken);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const createWorkspaceSuffix =
    deps.createWorkspaceSuffix ?? (() => randomBytes(3).toString("hex"));
  const createVentureSuffix =
    deps.createVentureSuffix ?? (() => randomBytes(3).toString("hex"));

  const client = await pool.connect();
  // Same deferred-error pattern as revokeFounderInvitation: the "expired"
  // branch must commit (the expiry write is real and should stick), so its
  // error can only be thrown after the shared commit below, never from
  // inside a branch that would otherwise trigger the catch block's rollback.
  let deferredError: ServiceError | undefined;
  let invitation: Invitation | undefined;
  let workspace: WorkspaceSummary | undefined;
  let venture: Venture | undefined;

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

    // Lock every Invitation for this email, in a stable order, in one shot
    // (email family, ascending id, then the User row). Two acceptance
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
    // directly — it documents/guards the invariant rather than trusting
    // the peek blindly.
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
        createWorkspaceSuffix,
        await resolveInvitingMentorUserId(client, target.invited_by_user_id),
      );

      const createdVenture = await createDefaultVentureForNewWorkspace(
        client,
        createdWorkspace.id,
        actor.userId,
        target.email,
        { createSlugSuffix: createVentureSuffix },
      );

      await setInitialActiveContext(
        client,
        actor.userId,
        createdWorkspace.id,
        createdVenture.id,
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
      venture = createdVenture;
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
  return { invitation: invitation!, workspace: workspace!, venture: venture! };
}

/**
 * The Mentor counterpart of acceptFounderInvitation: same locking order (peek
 * → lock the whole email family ascending by id → re-locate inside the locked
 * set → lock the user row), because the two run against the same rows and
 * must never acquire them in opposing orders.
 *
 * What it deliberately does NOT do is everything the Founder path does after
 * the role upgrade. A new Mentor gets no Workspace, no Venture, and no active
 * context: they own nothing yet, and their Workspaces arrive one at a time as
 * the Founders they invite accept. `user_active_contexts` stays empty until
 * a Mentor surface needs a stored selection — apps/web addresses Workspaces
 * by URL instead.
 */
export async function acceptMentorInvitation(
  actor: ActorContext,
  rawToken: unknown,
): Promise<{ invitation: Invitation }> {
  assertRole(actor, ["pending"]);

  const token = normalizeAndValidateInvitationToken(rawToken);
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const client = await pool.connect();
  let deferredError: ServiceError | undefined;
  let invitation: Invitation | undefined;

  try {
    await client.query("begin");

    const peeked = await client.query<{ id: string; email: string }>(
      `select id, email from invitations
       where token_hash = $1 and invite_role = 'mentor'`,
      [tokenHash],
    );
    const peekedInvitation = peeked.rows[0];
    if (!peekedInvitation) {
      throw new ServiceError("NOT_FOUND", "Mentor invitation not found.");
    }

    const familyResult = await client.query<InvitationRow>(
      `select * from invitations
       where lower(trim(email)) = lower(trim($1))
       order by id
       for update`,
      [peekedInvitation.email],
    );

    const target = familyResult.rows.find(
      (row) =>
        row.id === peekedInvitation.id &&
        row.token_hash === tokenHash &&
        row.invite_role === "mentor",
    );
    if (!target) {
      throw new ServiceError("NOT_FOUND", "Mentor invitation not found.");
    }

    // V1 only ever issues platform-level Mentor Invitations. A workspace-bound
    // one is legal per `invitations_workspace_target_check` (migration 0010
    // kept that shape for a future "assign a Mentor to this Workspace" flow)
    // but nothing writes it, and accepting one would have to bind
    // workspaces.mentor_user_id here. Refuse loudly rather than silently
    // dropping the binding and leaving the Workspace unmentored.
    if (target.workspace_id !== null) {
      throw new ServiceError(
        "VALIDATION_ERROR",
        "Workspace-bound mentor invitations cannot be accepted yet.",
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
         where id = $1 and invite_role = 'mentor' and status = 'pending'`,
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

      const roleUpdate = await client.query(
        `update users
         set role = 'mentor'
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

      const acceptedResult = await client.query<InvitationRow>(
        `update invitations
         set status = 'accepted', invited_user_id = $1, accepted_by_user_id = $1, accepted_at = now()
         where id = $2 and invite_role = 'mentor' and status = 'pending'
         returning *`,
        [actor.userId, target.id],
      );

      // Same two-statement split as the Founder path: a naturally expired
      // same-email invitation must not be recorded as if someone revoked it.
      await client.query(
        `update invitations
         set status = 'expired'
         where id <> $1
           and lower(trim(email)) = lower(trim($2))
           and status = 'pending'
           and expires_at <= now()`,
        [target.id, target.email],
      );

      await client.query(
        `update invitations
         set status = 'revoked', revoked_by_user_id = $1, revoked_at = now()
         where id <> $2
           and lower(trim(email)) = lower(trim($3))
           and status = 'pending'`,
        [actor.userId, target.id, target.email],
      );

      invitation = mapInvitation(acceptedResult.rows[0]);
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
  return { invitation: invitation! };
}

interface InvitationListRow extends InvitationRow {
  invited_by_name: string | null;
  invited_by_email: string | null;
  invited_by_role: UserRow["role"] | null;
}

function mapInvitationListItem(row: InvitationListRow): InvitationListItem {
  return {
    ...mapInvitation(row),
    invitedByName: row.invited_by_name,
    invitedByEmail: row.invited_by_email,
    invitedByRole: row.invited_by_role,
  };
}

async function listInvitations(
  actor: ActorContext,
  inviteRole: InviteRole,
): Promise<InvitationListItem[]> {
  // Mentors see only their own pipeline; Admins see everything. Applied as a
  // WHERE clause rather than a filter over fetched rows, so another Mentor's
  // invitations never leave the database in the first place.
  const scopeToInviter = actor.role === "mentor";

  const client = await pool.connect();
  try {
    await client.query("begin");

    // A data-modifying CTE and a statement reading it share the same
    // snapshot in Postgres — the outer query is not guaranteed to see the
    // CTE's own update. Two statements in one transaction guarantee it.
    await expireStaleInvitations(client, inviteRole);

    // Left join, not inner: an invitation whose sender's account was closed
    // must still be listed (and still be revocable), just without a name.
    const result = await client.query<InvitationListRow>(
      `select
         i.*,
         inviter.name as invited_by_name,
         inviter.email as invited_by_email,
         inviter.role as invited_by_role
       from invitations i
       left join users inviter on inviter.id = i.invited_by_user_id
       where i.invite_role = $1
         and ($2::uuid is null or i.invited_by_user_id = $2)
       order by i.created_at desc, i.id desc`,
      [inviteRole, scopeToInviter ? actor.userId : null],
    );

    await client.query("commit");

    return result.rows.map(mapInvitationListItem);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export type AcceptedInvitation =
  | {
      inviteRole: "founder";
      invitation: Invitation;
      workspace: WorkspaceSummary;
      venture: Venture;
    }
  | { inviteRole: "mentor"; invitation: Invitation };

/**
 * Routes a raw token to the accept path for the role it was issued for.
 *
 * Whoever redeems it cannot tell a Founder token from a Mentor one — both are
 * 43 opaque characters — so the caller has no basis to choose, and making the
 * choice part of the request would let anyone holding a stolen token discover
 * what it was for by trying both.
 *
 * This lookup is deliberately unlocked and non-authoritative; it picks a code
 * path and nothing else. Both accept functions re-find the row by token_hash
 * *and* invite_role inside their own `for update` lock, so anything changing
 * between this read and that lock can only produce a NOT_FOUND — never an
 * acceptance against the wrong role.
 */
export async function acceptInvitation(
  actor: ActorContext,
  rawToken: unknown,
  deps: AcceptInvitationDependencies = {},
): Promise<AcceptedInvitation> {
  // Fast-fail before touching the database, matching acceptFounderInvitation:
  // this is not the authoritative check, just an early exit that also keeps a
  // signed-in Founder from probing whether a token exists.
  assertRole(actor, ["pending"]);

  const token = normalizeAndValidateInvitationToken(rawToken);
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const result = await pool.query<{ invite_role: InviteRole }>(
    `select invite_role from invitations where token_hash = $1`,
    [tokenHash],
  );

  const inviteRole = result.rows[0]?.invite_role;
  if (!inviteRole) {
    throw new ServiceError("NOT_FOUND", "Invitation not found.");
  }

  if (inviteRole === "mentor") {
    const { invitation } = await acceptMentorInvitation(actor, token);
    return { inviteRole, invitation };
  }

  return { inviteRole, ...(await acceptFounderInvitation(actor, token, deps)) };
}

export async function listFounderInvitations(
  actor: ActorContext,
): Promise<InvitationListItem[]> {
  assertRole(actor, ["admin", "mentor"]);
  return listInvitations(actor, "founder");
}

export async function listMentorInvitations(
  actor: ActorContext,
): Promise<InvitationListItem[]> {
  assertRole(actor, ["admin"]);
  return listInvitations(actor, "mentor");
}
