-- =========================================================
-- 0009_backfill_preferred_ai_provider.sql
--
-- Answers the first-run assistant question on behalf of the Founders who
-- have already answered it in practice.
--
-- `user_profiles.preferred_ai_provider` has existed since the 0001
-- baseline, documented as the column that "drives the website onboarding
-- UI", but nothing has ever written it. The website now asks for it in a
-- dialog a Founder cannot dismiss, keyed off the column being null — which
-- means without this, every existing account, including ones mid-programme
-- with a live connection, would be stopped on their next page load and
-- asked a question whose answer is already sitting in the database.
--
-- The evidence is `mcp_oauth_grants`: a row there means the Founder
-- completed an OAuth authorisation, and until this release Claude was the
-- only assistant the website ever told anyone to connect. Accounts without
-- a grant have made no such choice and are left null on purpose — they get
-- the dialog, which is the intended behaviour for everyone new.
--
-- Deliberately not derived from the grant's client redirect hosts (see
-- mcpProviderForRedirectUris in packages/services/src/mcp-auth): that is
-- the right source for "what is connected right now", but this column is
-- the Founder's stated preference, and every pre-existing grant was made
-- by following Claude instructions regardless of what the client
-- registered itself as.
--
-- Idempotent: the `is null` guard means a re-run is a no-op, and it can
-- never overwrite a choice made through the dialog.
-- =========================================================

update user_profiles up
set preferred_ai_provider = 'claude',
    updated_at = now()
where up.preferred_ai_provider is null
  and exists (
    select 1
    from mcp_oauth_grants g
    where g.user_id = up.user_id
  );
