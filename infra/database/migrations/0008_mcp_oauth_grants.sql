-- =========================================================
-- 0008_mcp_oauth_grants.sql
--
-- Grant-origin identity for MCP connections, plus the provider widening
-- that lets a non-Claude client be recorded honestly.
--
-- Why a table and not a column on mcp_oauth_access_tokens: that table's
-- rows are replaced wholesale on every refresh — better-auth inserts a new
-- row and mcp-oauth-compat/token-validation.ts's after-hook deletes the old
-- family — so `created_at` on the surviving row is the last refresh, never
-- the moment the Founder authorised. Any rule with an absolute lifetime
-- needs a timestamp that survives rotation, and this is it. A column on the
-- token row would have to be copied forward by the rotation hook, and every
-- insert path that forgot to copy it (a better-auth upgrade, a manual fix,
-- a seed script) would silently reset the Founder's clock to zero.
--
-- Considered and rejected: deriving the origin from mcp_oauth_consents'
-- earliest Accept. 0004 documents that table as a permanent history log and
-- explicitly not a live gate, and it only records user-initiated decisions —
-- making it the live clock would force every expiry path to start writing
-- history rows for events nobody decided.
--
-- One row per (user, client) is the natural key for "a connection", which
-- mcp_oauth_access_tokens cannot be.
--
-- Note on the one-connection-at-a-time product rule: it is enforced in
-- recordMcpGrantIssued at authorization-code exchange (the newer grant
-- evicts the older), NOT by a constraint here. DCR is open and a Founder
-- switching from Claude to ChatGPT is a normal thing to do; a unique
-- constraint on user_id alone would turn that switch into an error at the
-- token endpoint instead of a clean handover.
-- =========================================================

create table mcp_oauth_grants (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references users(id) on delete cascade,

  client_id text not null
    references mcp_oauth_applications(client_id) on delete cascade,

  -- Reset by a fresh authorization_code exchange (re-consenting restarts
  -- the absolute cap), never touched by a refresh. This is the whole point
  -- of the table.
  granted_at timestamptz not null default now(),

  created_at timestamptz not null default now(),

  constraint mcp_oauth_grants_user_client_unique unique (user_id, client_id)
);

-- Every read is "the grants for this Founder" — the connection page, and
-- the limit checks in checkRefreshTokenIsRedeemable.
create index mcp_oauth_grants_user_id_idx on mcp_oauth_grants (user_id);

-- No updated_at: 0001's set_updated_at trigger loop ran once, over the
-- tables that existed at baseline, so a column here would never actually
-- update. 0004 already carries that trap; not inheriting it.

-- ---------------------------------------------------------
-- Backfill. Without this, deploying the enforcement code would treat every
-- existing connection as brand new — harmless for the 90-day cap, but it
-- would also mean the connection page keeps reporting the wrong
-- authorisation date for connections made before this migration.
--
-- Prefer the earliest recorded Accept for that client (the real origin);
-- fall back to the oldest surviving token row when no consent row exists.
-- ---------------------------------------------------------
insert into mcp_oauth_grants (user_id, client_id, granted_at)
select
  t.user_id,
  t.client_id,
  coalesce(
    (select min(c.created_at)
       from mcp_oauth_consents c
      where c.user_id = t.user_id
        and c.client_id = t.client_id
        and c.consent_given),
    min(t.created_at)
  )
from mcp_oauth_access_tokens t
where t.user_id is not null
group by t.user_id, t.client_id
on conflict (user_id, client_id) do nothing;

-- ---------------------------------------------------------
-- provider was hardcoded to 'claude' in packages/services/src/audit, so
-- every ChatGPT tool call recorded so far is mislabelled. The fix derives
-- it from the client's registered redirect host, which is the only
-- trustworthy signal available (DCR is unauthenticated, so client_name is
-- attacker-chosen free text). That detection is necessarily best-effort, so
-- an unrecognised client needs an honest value to record rather than being
-- forced into one of the two known brands.
--
-- Existing rows are left alone: they are all genuinely 'claude' or are
-- mislabelled ChatGPT calls we cannot now distinguish, and rewriting an
-- audit log to a guess is worse than leaving it as recorded.
-- ---------------------------------------------------------
alter table mcp_tool_audit_logs
  drop constraint mcp_tool_audit_logs_provider_check;

alter table mcp_tool_audit_logs
  add constraint mcp_tool_audit_logs_provider_check
  check (
    provider in (
      'claude',
      'openai',
      'other'
    )
  );
