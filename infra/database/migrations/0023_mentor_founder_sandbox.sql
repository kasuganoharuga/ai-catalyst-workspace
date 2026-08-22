-- =========================================================
-- MENTOR FOUNDER-PREVIEW SANDBOX
--
-- A Mentor can request a personal sandbox Workspace — one where they are
-- the founder_user_id — so they can walk the Founder flow themselves
-- before advising real Founders. This is deliberately NOT a multi-role
-- account model: users.role stays single-valued, and the sandbox is just
-- an ordinary Workspace that happens to be owned by a user whose
-- users.role is 'mentor'. Nothing here grants extra permissions by
-- itself — packages/contracts' ActorContext.actingAs is what turns a
-- Mentor's requests into Founder-scoped ones while previewing, and it can
-- only ever resolve to "founder" for a Mentor who owns a 'kind = sandbox'
-- Workspace (see packages/services/src/mentor/founder-preview.ts). Every
-- Founder-scoped service call still resolves scope via
-- resolveFounderWorkspace(actor) — i.e. `where founder_user_id =
-- actor.userId` — and workspaces_founder_unique guarantees a Mentor has at
-- most one such row, so a previewing Mentor is structurally incapable of
-- reaching any real Founder's data through this mechanism.
--
-- kind has no code path that ever UPDATEs it: a Workspace is sandbox or
-- live from the moment it's created, forever. This is a mode marker, not
-- a permission — a sandbox Workspace still enforces every ordinary
-- Founder-side constraint (workspaces_founder_unique,
-- workspaces_founder_not_mentor, etc.); it is additionally forbidden from
-- ever being assigned a Mentor of its own, so a live Founder-mentor
-- relationship and a Mentor's personal sandbox can never be confused.
--
-- No delete path is added for a sandbox Workspace, matching this schema's
-- existing archive-only discipline (see 0001's "Business/historical
-- records forbid hard delete" section, and 0003's partial unique index
-- letting an archived program_runs row coexist with a fresh one instead
-- of being deleted). Restarting a sandbox archives its current
-- program_runs row and opens a new one — the sandbox Workspace and
-- Venture rows themselves are never touched.
-- =========================================================

alter table workspaces
  add column kind text not null default 'live'
    check (kind in ('live', 'sandbox'));

comment on column workspaces.kind is
  'Set once at creation, never updated after — a Workspace does not '
  'transition between live and sandbox. ''live'' is every ordinary '
  'Founder Workspace created through invitation-accept; ''sandbox'' is a '
  'Mentor''s personal Workspace for previewing the Founder flow '
  '(packages/services/src/mentor/founder-preview.ts). Mentor-facing reads '
  '(listMentorFounders, assertMentorOwnsWorkspace, storage''s mentor '
  'read path, admin listings) filter to kind = ''live'' so a sandbox '
  'never appears as if it were a real Founder to review.';

alter table workspaces
  add constraint workspaces_sandbox_has_no_mentor
    check (kind <> 'sandbox' or mentor_user_id is null);

-- Used by resolveFounderSandboxWorkspaceId (mentor/founder-preview.ts) and
-- by the MCP bearer verifier, both keyed on founder_user_id (=
-- the Mentor's own userId on their sandbox row) plus kind.
create index workspaces_sandbox_idx on workspaces (founder_user_id)
  where kind = 'sandbox';

-- Mode, not permission: whether the web UI currently has this user's
-- session pointed at their sandbox as if they were its Founder. Purely a
-- display/routing switch, parallel to active_workspace_id's own comment
-- in 0001 — the actual authorization is always re-derived server-side via
-- resolveFounderPreviewState, never trusted from this column blindly
-- toggled elsewhere. MCP does not read this column at all: a Mentor's
-- Bearer token is scoped to their sandbox unconditionally whenever one
-- exists, independent of whatever the web session's toggle currently
-- says (see bearer.ts) — otherwise exiting preview in the browser would
-- silently break an already-connected Claude/ChatGPT session.
alter table user_active_contexts
  add column founder_preview boolean not null default false;
