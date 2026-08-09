-- =========================================================
-- 0016_module_events_observability.sql
--
-- Extends module_events for production observability:
--   * correlation columns (trace_id, request_id) joining CloudWatch / Sentry
--   * optional entity_type / entity_id for non-FK subjects (e.g. interview)
--   * additional mutation event_type values used by interview/evidence and
--     ready_for_review transitions
--
-- Technical / hydration diagnostics stay in structured logs — this table
-- remains append-only domain history only.
-- =========================================================

alter table module_events
  add column if not exists trace_id text,
  add column if not exists request_id text,
  add column if not exists entity_type text,
  add column if not exists entity_id text;

alter table module_events
  drop constraint module_events_event_type_check;

alter table module_events
  add constraint module_events_event_type_check
  check (
    event_type in (
      'module_inherited',
      'module_unlocked',
      'module_started',
      'attempt_started',
      'response_saved',
      'draft_saved',
      'artifact_uploaded',
      'artifact_generated',
      'attempt_submitted',
      'validation_started',
      'validation_failed',
      'validation_passed',
      'attempt_ready_for_review',
      'attempt_accepted',
      'attempt_rejected',
      'attempt_cancelled',
      'retry_started',
      'ready_to_unlock',
      'module_completed',
      'interview_set_submitted',
      'evidence_confirmed',
      'evidence_reopened',
      'workflow_state_inconsistency_detected'
    )
  );

create index if not exists idx_module_events_trace_id
  on module_events (trace_id)
  where trace_id is not null;

create index if not exists idx_module_events_request_id
  on module_events (request_id)
  where request_id is not null;
