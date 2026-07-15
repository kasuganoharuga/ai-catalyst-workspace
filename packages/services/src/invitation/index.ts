import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { Invitation, InvitationStatus } from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";

// Founder invitations only (infra/database/migrations/0001_aidb_v5_baseline.sql
// section 6). Mentor invitations are workspace-bound and belong to a later
// PR (4.1) — every query here is deliberately scoped with
// `invite_role = 'founder'` so this module can never touch a mentor row.
const FOUNDER_INVITATION_TTL_DAYS = 7;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface InvitationRow {
  id: string;
  email: string;
  invite_role: "founder" | "mentor";
  workspace_id: string | null;
  status: InvitationStatus;
  invited_by_user_id: string | null;
  personal_message: string | null;
  expires_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
  updated_at: Date;
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
