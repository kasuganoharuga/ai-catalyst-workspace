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

// Founder and mentor invitations share acceptance locking (email family).
// Founder <- admin/mentor; mentor <- admin only (platform-level).
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

// Structural guard for Postgres error codes in catch blocks.
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

// Runtime validation of untrusted JSON input at the API boundary.
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

// Trim pasted tokens before format check and hash lookup.
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

// Private default workspace name/slug until rename UX exists.
function defaultWorkspaceDetails(email: string): {
  name: string;
  base: string;
} {
  const localPart = email.split("@")[0]?.trim() ?? "";
  const base = slugifyBase(localPart, "founder");

  return { name: `${localPart || "Founder"}'s Workspace`, base };
}

// ON CONFLICT (slug) do nothing retries suffix; founder_unique 23505 still rolls back.
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

// Expire stale pending rows before every mutating/list op — indexes ignore expires_at.
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

// Mentor scoped to own invitations; admin unscoped. NOT_FOUND not FORBIDDEN — no enumeration oracle.
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

    // workspace_id null: founder invite pre-workspace; mentor invite platform-level.
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
    // 23505 aborts txn — rollback before mapping, not after.
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

// Mentor-issued founder invite sets workspaces.mentor_user_id from invited_by at accept.
export async function createFounderInvitation(
  actor: ActorContext,
  input: { email: string; personalMessage?: string },
): Promise<{ invitation: Invitation; rawToken: string }> {
  assertRole(actor, ["admin", "mentor"]);
  return createInvitation(actor, "founder", input);
}

// Admin-only — mentors must not recruit mentors without a gatekeeper.
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
  // Deferred error after commit — catch must not rollback a committed expiry write.
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
 * Resolve inviting mentor at accept time — demoted/deleted inviter yields unmentored workspace.
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

// Single txn: lock → validate → role upgrade → workspace/venture → revoke siblings.
export async function acceptFounderInvitation(
  actor: ActorContext,
  rawToken: unknown,
  deps: AcceptInvitationDependencies = {},
): Promise<{
  invitation: Invitation;
  workspace: WorkspaceSummary;
  venture: Venture;
}> {
  // Session role fast-fail only — authoritative check is locked user row below.
  assertRole(actor, ["pending"]);

  const token = normalizeAndValidateInvitationToken(rawToken);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const createWorkspaceSuffix =
    deps.createWorkspaceSuffix ?? (() => randomBytes(3).toString("hex"));
  const createVentureSuffix =
    deps.createVentureSuffix ?? (() => randomBytes(3).toString("hex"));

  const client = await pool.connect();
  // Deferred expiry error — commit must succeed before throw (same as revoke).
  let deferredError: ServiceError | undefined;
  let invitation: Invitation | undefined;
  let workspace: WorkspaceSummary | undefined;
  let venture: Venture | undefined;

  try {
    await client.query("begin");

    // Unlocked peek for email; founder role filter blocks mentor tokens here.
    const peeked = await client.query<{ id: string; email: string }>(
      `select id, email from invitations
       where token_hash = $1 and invite_role = 'founder'`,
      [tokenHash],
    );
    const peekedInvitation = peeked.rows[0];
    if (!peekedInvitation) {
      throw new ServiceError("NOT_FOUND", "Founder invitation not found.");
    }

    // Lock full email family by id order — stable lock order prevents deadlocks.
    const familyResult = await client.query<InvitationRow>(
      `select * from invitations
       where lower(trim(email)) = lower(trim($1))
       order by id
       for update`,
      [peekedInvitation.email],
    );

    // Re-find target in locked set — guards invariant if peek ever diverged.
    const target = familyResult.rows.find(
      (row) =>
        row.id === peekedInvitation.id &&
        row.token_hash === tokenHash &&
        row.invite_role === "founder",
    );
    if (!target) {
      throw new ServiceError("NOT_FOUND", "Founder invitation not found.");
    }

    // Founder invitations must have null workspace_id — corruption trip wire.
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

      // Conditional role update — zero rows means stale/replayed accept aborts.
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

      // workspace_id stays null — link is invited_user_id → founder_user_id.
      const acceptedResult = await client.query<InvitationRow>(
        `update invitations
         set status = 'accepted', invited_user_id = $1, accepted_by_user_id = $1, accepted_at = now()
         where id = $2 and invite_role = 'founder' and status = 'pending'
         returning *`,
        [actor.userId, target.id],
      );

      // Expire naturally stale siblings separately — no revoked_by on natural expiry.
      await client.query(
        `update invitations
         set status = 'expired'
         where id <> $1
           and lower(trim(email)) = lower(trim($2))
           and status = 'pending'
           and expires_at <= now()`,
        [target.id, target.email],
      );

      // Revoke remaining pending same-email invites (any role).
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
 * Mentor accept — same locking as founder; no workspace/venture creation.
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

    // V1 only platform-level mentor invites — workspace-bound shape refused loudly.
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

      // Same two-statement expiry/revoke split as founder path.
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
  // Mentor list scoped in SQL — other mentors' rows never leave the database.
  const scopeToInviter = actor.role === "mentor";

  const client = await pool.connect();
  try {
    await client.query("begin");

    // Two statements so list sees expireStaleInvitations updates (CTE snapshot rule).
    await expireStaleInvitations(client, inviteRole);

    // Left join: closed inviter accounts still list (revocable, name optional).
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
 * Route opaque token to founder or mentor accept — role must not leak to caller.
 * Unlocked lookup only picks path; accept functions re-lock authoritatively.
 */
export async function acceptInvitation(
  actor: ActorContext,
  rawToken: unknown,
  deps: AcceptInvitationDependencies = {},
): Promise<AcceptedInvitation> {
  // Pending fast-fail before DB — not authoritative; blocks signed-in founder probing.
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
