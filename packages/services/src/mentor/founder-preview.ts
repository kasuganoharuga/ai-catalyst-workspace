import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { FounderSandboxSummary } from "@ai-catalyst/shared";

import { ServiceError } from "@ai-catalyst/services/errors";
import { withTransaction } from "@ai-catalyst/services/internal/transaction";
import {
  listRunModulesForBranch,
  resolveWorkspaceRunContext,
} from "@ai-catalyst/services/internal/run-module";
import { countSavedArtefacts } from "@ai-catalyst/services/mentor/internal/artefact-query";
import { createDefaultVentureForNewWorkspace } from "@ai-catalyst/services/venture";
import { insertWorkspaceWithRetry } from "@ai-catalyst/services/workspace/internal/insert-workspace";

// A Mentor's own sandbox for walking the Founder flow themselves — see
// infra/database/migrations/0023_mentor_founder_sandbox.sql and
// 0024_mentor_sandbox_multiple.sql for the schema, and
// packages/contracts/src/actor-context.ts's `actingAs` for how this turns
// into real Founder-scoped access. Product-wise a Mentor only ever has ONE
// usable sandbox: starting a new one (createFounderSandbox) permanently
// demotes whatever was current, with no UI path back to it. The schema
// still never deletes that old row (this codebase's usual no-hard-delete
// discipline — see restartFounderSandbox below), so a Mentor who starts
// over repeatedly does accumulate dormant `kind='sandbox'` rows, but
// `is_current_sandbox` (workspaces_one_current_sandbox_per_mentor) always
// picks out exactly one — that's the one resolveFounderWorkspace()
// resolves to, so it's also the only one MCP can ever reach. Every
// function here checks actor.role directly, never assertRole/effectiveRole:
// these are operations on the preview overlay itself (turning it on, off,
// starting a new sandbox), not Founder-scoped operations the overlay
// should affect — exitFounderPreview in particular must keep working
// *while* the actor is currently previewing.
function assertRealMentor(actor: ActorContext): void {
  if (actor.role !== "mentor") {
    throw new ServiceError(
      "FORBIDDEN",
      "Only a Mentor may manage a Founder-preview sandbox.",
    );
  }
}

async function resolveMentorEmail(userId: string): Promise<string> {
  const result = await pool.query<{ email: string }>(
    `select email from users where id = $1`,
    [userId],
  );
  const email = result.rows[0]?.email;
  if (!email) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `User ${userId} has no email — cannot name their sandbox Workspace.`,
    );
  }
  return email;
}

async function resolveActiveVentureId(
  executor: PoolClient | typeof pool,
  workspaceId: string,
): Promise<string> {
  const result = await executor.query<{ id: string }>(
    `select id from ventures
     where workspace_id = $1 and status <> 'archived'
     order by created_at asc
     limit 1`,
    [workspaceId],
  );
  const ventureId = result.rows[0]?.id;
  if (!ventureId) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `Sandbox Workspace ${workspaceId} has no active Venture.`,
    );
  }
  return ventureId;
}

/**
 * Makes `workspaceId` this Mentor's current sandbox: demotes whatever was
 * current before (a no-op if nothing was), promotes the target, and points
 * their active context at it. Always demote-then-promote in that order
 * within one transaction, never the reverse: promoting a second row before
 * demoting the first would transiently violate
 * workspaces_one_current_sandbox_per_mentor.
 *
 * `founderPreview` is explicit rather than always true: lazily provisioning
 * a sandbox (ensureFounderSandbox, when a Mentor has none yet) must not by
 * itself flip the web session into preview mode — only enterFounderPreview
 * does that — whereas starting a brand-new sandbox from the /sandbox page
 * takes the Mentor straight there, so that path does turn it on.
 */
async function setCurrentSandbox(
  client: PoolClient,
  mentorUserId: string,
  workspaceId: string,
  ventureId: string,
  founderPreview: boolean,
): Promise<void> {
  await client.query(
    `update workspaces set is_current_sandbox = false, updated_at = now()
     where founder_user_id = $1 and kind = 'sandbox' and is_current_sandbox`,
    [mentorUserId],
  );
  await client.query(
    `update workspaces set is_current_sandbox = true, updated_at = now()
     where id = $1`,
    [workspaceId],
  );
  await client.query(
    `insert into user_active_contexts (user_id, active_workspace_id, active_venture_id, founder_preview)
     values ($1, $2, $3, $4)
     on conflict (user_id) do update set
       active_workspace_id = excluded.active_workspace_id,
       active_venture_id = excluded.active_venture_id,
       founder_preview = excluded.founder_preview,
       updated_at = now()`,
    [mentorUserId, workspaceId, ventureId, founderPreview],
  );
}

export interface FounderPreviewState {
  /** True only when role === "mentor" AND they have a *current* `kind = 'sandbox'` Workspace. */
  hasSandbox: boolean;
  sandboxWorkspaceId: string | null;
  /** The web session's toggle — irrelevant to MCP, which grants sandbox access unconditionally whenever hasSandbox is true (see mcp-auth/bearer.ts). */
  previewEnabled: boolean;
}

/**
 * The single source of truth `actingAs` is derived from — both the web
 * layer (gated by the toggle) and the MCP bearer verifier (ignoring the
 * toggle) call this and nothing else. Never trust a client-supplied
 * "I'm previewing" flag; this always re-derives from current DB state.
 * Resolves to the *current* sandbox only — a Mentor may have older, dormant
 * ones left over from starting over (see createFounderSandbox), but the
 * product exposes only this one.
 */
export async function resolveFounderPreviewState(
  userId: string,
): Promise<FounderPreviewState> {
  const result = await pool.query<{
    user_role: string;
    sandbox_workspace_id: string | null;
    founder_preview: boolean | null;
  }>(
    `select u.role as user_role, w.id as sandbox_workspace_id, uac.founder_preview
     from users u
     left join workspaces w
       on w.founder_user_id = u.id and w.kind = 'sandbox' and w.is_current_sandbox
     left join user_active_contexts uac on uac.user_id = u.id
     where u.id = $1`,
    [userId],
  );
  const row = result.rows[0];
  const hasSandbox =
    row?.user_role === "mentor" && row.sandbox_workspace_id !== null;

  return {
    hasSandbox,
    sandboxWorkspaceId: hasSandbox ? row!.sandbox_workspace_id : null,
    previewEnabled: hasSandbox && row!.founder_preview === true,
  };
}

interface CurrentSandboxRow {
  id: string;
  name: string;
  created_at: Date;
}

/**
 * The Mentor's current sandbox Workspace row, or null if they have none.
 * Shared by getFounderSandboxSummary and hasActiveSandboxRun so the pin to
 * `founder_user_id = actor.userId and kind = 'sandbox' and is_current_sandbox`
 * — the whole reason either function is self-scoped — lives in one place.
 * Caller must call assertRealMentor first.
 */
async function resolveCurrentSandboxWorkspace(
  actor: ActorContext,
): Promise<CurrentSandboxRow | undefined> {
  // workspaces_one_current_sandbox_per_mentor (migration 0024) makes this
  // at most one row, same guarantee resolveFounderPreviewState relies on.
  const result = await pool.query<CurrentSandboxRow>(
    `select id, name, created_at from workspaces
     where founder_user_id = $1 and kind = 'sandbox' and is_current_sandbox`,
    [actor.userId],
  );
  return result.rows[0];
}

/**
 * Whether the Mentor's current sandbox has an active (non-archived) Run —
 * the cheap existence check FounderPreviewBanner needs to decide whether
 * "Restart sandbox" has anything to restart. Deliberately not
 * getFounderSandboxSummary: that loads the module list and artefact count,
 * and the banner mounts on every page while previewing, so it only ever
 * needs the boolean.
 */
export async function hasActiveSandboxRun(
  actor: ActorContext,
): Promise<boolean> {
  assertRealMentor(actor);

  const workspace = await resolveCurrentSandboxWorkspace(actor);
  if (!workspace) {
    return false;
  }
  return (await resolveWorkspaceRunContext(workspace.id)) !== null;
}

/**
 * Progress inside the Mentor's own current sandbox, for /sandbox to show
 * instead of two bare buttons. Returns null when they have no sandbox yet.
 *
 * Self-scoped on purpose, and this is the whole reason it exists rather
 * than reusing getMentorFounderDetail: that path goes through
 * assertMentorOwnsWorkspace, which requires `kind = 'live'` and therefore
 * excludes every sandbox by design. Here the workspace is pinned to
 * `founder_user_id = actor.userId and kind = 'sandbox'`, so no argument
 * reaches the query and no other user's data is addressable — there is
 * deliberately no workspaceId parameter.
 *
 * Read-only: unlike ensureFounderSandbox this never provisions anything, so
 * rendering the page cannot create a sandbox as a side effect.
 */
export async function getFounderSandboxSummary(
  actor: ActorContext,
): Promise<FounderSandboxSummary | null> {
  assertRealMentor(actor);

  const workspace = await resolveCurrentSandboxWorkspace(actor);
  if (!workspace) {
    return null;
  }

  const base = {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    createdAt: workspace.created_at.toISOString(),
  };

  const run = await resolveWorkspaceRunContext(workspace.id);
  if (!run) {
    // Sandbox created but never entered — nulls, not zeroes, exactly as
    // getMentorFounderDetail reports a Founder who never started.
    return {
      ...base,
      totalModules: null,
      completedModules: null,
      artefactCount: 0,
      lastCompletedAt: null,
      nextModule: null,
    };
  }

  const [allModules, artefactCount] = await Promise.all([
    listRunModulesForBranch(run.activeBranchId),
    countSavedArtefacts(run.activeBranchId),
  ]);

  // Same setup-Module exclusion as listMentorFounders and the Founder's own
  // catalogue: Module 0 is system-driven and never shown as progress.
  const modules = allModules.filter((module) => module.moduleType !== "setup");
  const completedAts = modules
    .map((module) => module.completedAt)
    .filter((value): value is string => value !== null);

  // "available" or "in_progress" — the same pair start-or-resume treats as
  // startable and the Founder dashboard's findCurrentModule() calls current.
  // Deliberately not "ready_to_unlock", which the UI labels "Almost there".
  // listRunModulesForBranch orders by sequence_index, so this is the earliest.
  const next = modules.find(
    (module) =>
      module.status === "available" || module.status === "in_progress",
  );

  return {
    ...base,
    totalModules: modules.length,
    completedModules: modules.filter((module) => module.status === "completed")
      .length,
    artefactCount,
    // Latest module completion. The Mentor's Founder detail page labels the
    // same figure "Last activity"; keeping one definition means the sandbox
    // and a real Founder cannot come to measure it differently.
    lastCompletedAt:
      completedAts.length > 0
        ? completedAts.reduce((a, b) => (a > b ? a : b))
        : null,
    nextModule: next
      ? {
          moduleKey: next.moduleKey,
          title: next.title,
          sequenceIndex: next.sequenceIndex,
        }
      : null,
  };
}

/**
 * Always creates a brand-new sandbox Workspace + default Venture, and
 * makes it current — this is "start a new sandbox" from the Mentor's point
 * of view, and it is destructive in the only sense the UI cares about: the
 * old current sandbox (if any) becomes permanently unreachable through the
 * product the moment this returns, since resolveFounderPreviewState and
 * resolveFounderWorkspace both only ever resolve to whichever Workspace is
 * `is_current_sandbox`. The caller (the /sandbox "start new" action) must
 * confirm with the Mentor before calling this.
 *
 * The old row is not deleted, though — matching this schema's archive-only
 * discipline — it simply becomes an orphaned `kind='sandbox'` row with
 * `is_current_sandbox = false` that nothing in the product surfaces again.
 * There is currently no automatic cleanup of these.
 *
 * `enablePreview` defaults to true (the "start a new sandbox" button takes
 * the Mentor straight into it) — ensureFounderSandbox passes false for its
 * lazy first-provisioning fallback, since creating the sandbox structure
 * should not by itself flip the web session into preview mode.
 */
export async function createFounderSandbox(
  actor: ActorContext,
  { enablePreview = true }: { enablePreview?: boolean } = {},
): Promise<{ workspaceId: string; ventureId: string }> {
  assertRealMentor(actor);

  const email = await resolveMentorEmail(actor.userId);
  const localPart = email.split("@")[0]?.trim() || "Mentor";

  return withTransaction(async (client) => {
    const countResult = await client.query<{ count: string }>(
      `select count(*) from workspaces where founder_user_id = $1 and kind = 'sandbox'`,
      [actor.userId],
    );
    const ordinal = Number(countResult.rows[0].count) + 1;

    // mentor_user_id stays null — workspaces_sandbox_has_no_mentor forbids
    // a sandbox ever being assigned a Mentor of its own.
    const workspace = await insertWorkspaceWithRetry(
      client,
      actor.userId,
      email,
      () => randomBytes(3).toString("hex"),
      null,
      "sandbox",
      `${localPart}'s Sandbox #${ordinal}`,
    );
    const venture = await createDefaultVentureForNewWorkspace(
      client,
      workspace.id,
      actor.userId,
      email,
    );
    await setCurrentSandbox(
      client,
      actor.userId,
      workspace.id,
      venture.id,
      enablePreview,
    );

    return { workspaceId: workspace.id, ventureId: venture.id };
  });
}

/**
 * Idempotent. Returns the Mentor's current sandbox, creating their first
 * one if they have none at all. Deliberately lazy — most Mentors will
 * never click "try the Founder flow," so nothing is provisioned until
 * they do.
 */
export async function ensureFounderSandbox(
  actor: ActorContext,
): Promise<{ workspaceId: string; ventureId: string }> {
  assertRealMentor(actor);

  const existing = await resolveFounderPreviewState(actor.userId);
  if (existing.hasSandbox) {
    const ventureId = await resolveActiveVentureId(
      pool,
      existing.sandboxWorkspaceId!,
    );
    return { workspaceId: existing.sandboxWorkspaceId!, ventureId };
  }

  return createFounderSandbox(actor, { enablePreview: false });
}

/** Provisions a first sandbox if needed, then flips the web session's preview toggle on. */
export async function enterFounderPreview(
  actor: ActorContext,
): Promise<{ workspaceId: string; ventureId: string }> {
  assertRealMentor(actor);
  const sandbox = await ensureFounderSandbox(actor);

  await pool.query(
    `update user_active_contexts
     set founder_preview = true, updated_at = now()
     where user_id = $1`,
    [actor.userId],
  );

  return sandbox;
}

export async function exitFounderPreview(actor: ActorContext): Promise<void> {
  assertRealMentor(actor);

  await pool.query(
    `update user_active_contexts
     set founder_preview = false, updated_at = now()
     where user_id = $1`,
    [actor.userId],
  );
}

/**
 * Archives every non-archived program_runs row under the *current*
 * sandbox's Venture(s) — never deletes. The next visit opens a fresh Run
 * the same way any Founder's first visit does (getOrCreateProgramRun);
 * this function only clears the way for that by ending what's there,
 * matching the schema's archive-only discipline (0001's "forbid hard
 * delete", 0003's partial unique index letting archived and live Runs
 * coexist). This resets the current sandbox's *Run* in place — it does
 * not create a new sandbox Workspace; see createFounderSandbox for that.
 */
export async function restartFounderSandbox(
  actor: ActorContext,
): Promise<{ workspaceId: string; ventureId: string }> {
  assertRealMentor(actor);

  const state = await resolveFounderPreviewState(actor.userId);
  if (!state.hasSandbox) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "No sandbox exists yet to restart.",
    );
  }

  const ventureId = await resolveActiveVentureId(
    pool,
    state.sandboxWorkspaceId!,
  );

  const result = await pool.query(
    `update program_runs
     set status = 'archived', archived_at = now(), updated_at = now()
     where venture_id = $1 and status <> 'archived'`,
    [ventureId],
  );
  // A brand-new sandbox, or one already restarted, has no non-archived Run
  // to archive — the UPDATE above is then a genuine no-op. Reject rather
  // than let the caller report "restarted" for nothing: FounderPreviewBanner
  // hides its own Restart control once hasActiveSandboxRun is false, so
  // reaching this is a stale client, not a real click on a visible button.
  if (result.rowCount === 0) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "The sandbox has nothing running to restart yet.",
    );
  }

  return { workspaceId: state.sandboxWorkspaceId!, ventureId };
}
