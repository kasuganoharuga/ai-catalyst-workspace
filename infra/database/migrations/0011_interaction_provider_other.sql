-- =========================================================
-- 0011_interaction_provider_other.sql
--
-- Lets the Founder-facing provenance columns record the same three
-- providers `ActorContext.provider` can actually hold.
--
-- 0008 already made this move for `mcp_tool_audit_logs.provider`, and its
-- reasoning applies unchanged here: the provider is derived from the OAuth
-- client's registered redirect host (mcpProviderForRedirectUris), Dynamic
-- Client Registration is open, and a client that is neither Claude nor
-- ChatGPT is a legitimate thing to record honestly rather than force into
-- one of the two known brands.
--
-- What this unblocks: every mapper that turns an MCP ActorContext into a
-- provenance value — resolveInteractionProvider, resolveSubmissionCreatedVia,
-- resolveArtifactEventSourceProvider, resolveStorageCreatedVia — returned a
-- hardcoded 'claude' for *any* MCP actor, dating from when Claude was the
-- only client the website told anyone to connect. Since the Founder can now
-- choose ChatGPT (user_profiles.preferred_ai_provider, backfilled in 0009),
-- those columns have been quietly labelling ChatGPT work as Claude. The
-- mappers switch on actor.provider in the same change as this migration;
-- without 'other' in these domains they would have no honest value for a
-- third-party client and the insert would fail its check constraint.
--
-- Existing rows are left alone, for the same reason 0008 left the audit log
-- alone: they are either genuinely 'claude' or mislabelled ChatGPT work we
-- can no longer distinguish, and rewriting provenance to a guess is worse
-- than leaving it as recorded.
--
-- Constraints are dropped by their auto-generated `<table>_<column>_check`
-- name rather than `if exists`, deliberately: if a name has drifted, this
-- must fail loudly rather than silently leave the old constraint in place
-- alongside a same-named new one that never gets enforced.
-- =========================================================

-- ---------------------------------------------------------
-- module_attempts.started_via — which surface started the Attempt.
-- Keeps 'system' (auto-started Attempts have no AI client).
-- ---------------------------------------------------------
alter table module_attempts
  drop constraint module_attempts_started_via_check;

alter table module_attempts
  add constraint module_attempts_started_via_check
  check (
    started_via in (
      'website',
      'claude',
      'openai',
      'other',
      'system'
    )
  );

-- ---------------------------------------------------------
-- module_responses.source_provider — where a confirmed answer came from.
-- Still no 'system': a system actor has no business writing a Founder's
-- answer, and resolveInteractionProvider's caller throws before reaching
-- the insert if one ever does.
-- ---------------------------------------------------------
alter table module_responses
  drop constraint module_responses_source_provider_check;

alter table module_responses
  add constraint module_responses_source_provider_check
  check (
    source_provider in (
      'website',
      'claude',
      'openai',
      'other'
    )
  );

-- ---------------------------------------------------------
-- module_events.source_provider — nullable, and narrower than the
-- sibling actor_type column (no 'admin', no 'mcp').
-- ---------------------------------------------------------
alter table module_events
  drop constraint module_events_source_provider_check;

alter table module_events
  add constraint module_events_source_provider_check
  check (
    source_provider is null
    or source_provider in (
      'website',
      'claude',
      'openai',
      'other',
      'system'
    )
  );

-- ---------------------------------------------------------
-- storage_objects.created_via — who caused the object to be written.
-- ---------------------------------------------------------
alter table storage_objects
  drop constraint storage_objects_created_via_check;

alter table storage_objects
  add constraint storage_objects_created_via_check
  check (
    created_via in (
      'website',
      'claude',
      'openai',
      'other',
      'renderer',
      'system',
      'import'
    )
  );

-- ---------------------------------------------------------
-- artifact_submissions.created_via — same domain as storage_objects.
-- ---------------------------------------------------------
alter table artifact_submissions
  drop constraint artifact_submissions_created_via_check;

alter table artifact_submissions
  add constraint artifact_submissions_created_via_check
  check (
    created_via in (
      'website',
      'claude',
      'openai',
      'other',
      'renderer',
      'system',
      'import'
    )
  );
