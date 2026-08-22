-- =========================================================
-- MULTIPLE MENTOR SANDBOXES, EXACTLY ONE CURRENT
--
-- 0023 gave a Mentor a single sandbox Workspace, enforced by
-- workspaces_founder_unique (unique on founder_user_id, with no kind
-- distinction). That's too strict for real use: a Mentor restarting their
-- sandbox loses the old one outright, and there's no way to keep more than
-- one around to compare. This migration lets a Mentor accumulate any
-- number of sandbox Workspaces over time, while keeping the one property
-- that actually matters — at most one is ever "current" for a given
-- Mentor, because that's the one resolveFounderWorkspace() (and therefore
-- every Founder-scoped service call, and the MCP Bearer verifier) resolves
-- to. Without that constraint, "which sandbox is this request against"
-- would be ambiguous the moment a Mentor had two.
--
-- A real Founder's live Workspace is unaffected: still exactly one per
-- founder_user_id, just expressed as a partial index scoped to kind =
-- 'live' instead of a table-wide constraint, since kind = 'sandbox' rows
-- no longer share that uniqueness domain.
-- =========================================================

alter table workspaces drop constraint workspaces_founder_unique;

create unique index workspaces_founder_live_unique
  on workspaces (founder_user_id)
  where kind = 'live';

alter table workspaces
  add column is_current_sandbox boolean not null default false;

alter table workspaces
  add constraint workspaces_current_flag_only_on_sandbox
    check (not is_current_sandbox or kind = 'sandbox');

-- The one property this whole migration exists for: at most one current
-- sandbox per Mentor. Switching (mentor/founder-preview.ts's
-- switchCurrentFounderSandbox) always flips the old current row to false
-- and the new one to true inside the same transaction — never sets a
-- second row true first — so this index is never transiently violated.
create unique index workspaces_one_current_sandbox_per_mentor
  on workspaces (founder_user_id)
  where kind = 'sandbox' and is_current_sandbox;

comment on column workspaces.is_current_sandbox is
  'Which of a Mentor''s (possibly several) sandbox Workspaces is the one '
  'resolveFounderWorkspace() resolves to — for MCP in particular, this is '
  'the only sandbox a connected Claude/ChatGPT session can ever reach, '
  'independent of anything in the web session. Meaningless (always false) '
  'on a kind = ''live'' row.';

-- Backfill: every sandbox created under 0023's one-per-mentor rule becomes
-- that mentor's current one (there is at most one per founder_user_id
-- among existing rows, so this can never trip the new partial unique
-- index above).
update workspaces set is_current_sandbox = true where kind = 'sandbox';
