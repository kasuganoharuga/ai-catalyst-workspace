-- =========================================================
-- 0015_interview_set_submitted.sql
--
-- Whole-set Submit interviews sits between per-interview Complete
-- and Confirm evidence:
--   draft → submitted → confirmed
-- =========================================================

alter table interview_activities
  add column if not exists evidence_submitted_at timestamptz;

alter table interview_activities
  drop constraint if exists interview_activities_evidence_status_check;

alter table interview_activities
  drop constraint if exists interview_activities_confirmed_requires_at;

-- Postgres names CHECK constraints on the column differently as
-- interview_activities_evidence_status_check when inlined on the column.
-- Recreate both status membership and the three-way lifecycle invariant.
alter table interview_activities
  add constraint interview_activities_evidence_status_check
    check (evidence_status in ('draft', 'submitted', 'confirmed'));

alter table interview_activities
  add constraint interview_activities_evidence_lifecycle_check
    check (
      (
        evidence_status = 'draft'
        and evidence_submitted_at is null
        and evidence_confirmed_at is null
        and confirmed_markdown is null
      )
      or (
        evidence_status = 'submitted'
        and evidence_submitted_at is not null
        and evidence_confirmed_at is null
        and confirmed_markdown is null
      )
      or (
        evidence_status = 'confirmed'
        and evidence_confirmed_at is not null
        and confirmed_markdown is not null
      )
    );
