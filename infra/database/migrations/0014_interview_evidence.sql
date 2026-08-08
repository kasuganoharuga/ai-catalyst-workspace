-- =========================================================
-- 0014_interview_evidence.sql
--
-- Module 3 → Module 4 interview evidence lifecycle:
--   interview_activities  — questions snapshot + evidence_status
--   interview_records     — per-interview operational forms
--   module_attempts.source_interview_evidence_artifact_id
--     — immutable pin for a Claude attempt's Analyse→Plan chain
-- =========================================================

create table interview_activities (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references workspaces(id) on delete cascade,

  program_run_id uuid not null,

  -- Module 3 accepted attempt that produced the confirmed guide.
  source_module_attempt_id uuid not null,

  -- Final confirmed Interview Guide questions (source of truth for forms/PDF).
  questions jsonb not null,

  evidence_status text not null default 'draft'
    check (evidence_status in ('draft', 'confirmed')),

  evidence_confirmed_at timestamptz,

  -- Canonical markdown after Confirm evidence (null while draft).
  confirmed_markdown text,

  -- Provenance: interview_records.id values baked into the confirmed artifact.
  confirmed_source_record_ids jsonb not null default '[]'::jsonb,

  -- Set when the confirmed markdown is materialised as an artifact_submission
  -- on a Module 4 attempt (Continue in Claude / startOrResumeAttempt).
  confirmed_artifact_submission_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint interview_activities_run_workspace_fk
    foreign key (program_run_id, workspace_id)
    references program_runs (id, workspace_id)
    on delete cascade,

  constraint interview_activities_attempt_workspace_fk
    foreign key (source_module_attempt_id, workspace_id)
    references module_attempts (id, workspace_id)
    on delete cascade,

  constraint interview_activities_run_unique
    unique (program_run_id),

  constraint interview_activities_id_workspace_unique
    unique (id, workspace_id),

  constraint interview_activities_confirmed_requires_at
    check (
      (evidence_status = 'draft' and evidence_confirmed_at is null)
      or (
        evidence_status = 'confirmed'
        and evidence_confirmed_at is not null
        and confirmed_markdown is not null
      )
    )
);

create index interview_activities_workspace_id_idx
  on interview_activities (workspace_id);

create table interview_records (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null,

  activity_id uuid not null,

  sequence_index integer not null
    check (sequence_index > 0),

  interviewee_name text not null default '',
  company text not null default '',
  role text not null default '',
  interviewed_at date,

  -- Map of question index ("1".."5") → answer text.
  answers jsonb not null default '{}'::jsonb,

  key_quote text,
  current_workaround text,

  status text not null default 'draft'
    check (status in ('draft', 'completed')),

  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint interview_records_activity_workspace_fk
    foreign key (activity_id, workspace_id)
    references interview_activities (id, workspace_id)
    on delete cascade,

  constraint interview_records_activity_sequence_unique
    unique (activity_id, sequence_index),

  constraint interview_records_completed_requires_at
    check (
      (status = 'draft' and completed_at is null)
      or (status = 'completed' and completed_at is not null)
    )
);

create index interview_records_activity_id_idx
  on interview_records (activity_id);

create index interview_records_workspace_id_idx
  on interview_records (workspace_id);

-- Pin confirmed Interview-Evidence.md onto a Module 4 Claude attempt.
alter table module_attempts
  add column source_interview_evidence_artifact_id uuid;

alter table module_attempts
  add constraint module_attempts_source_interview_evidence_fk
  foreign key (source_interview_evidence_artifact_id, workspace_id)
  references artifact_submissions (id, workspace_id)
  on delete set null;

create trigger interview_activities_set_updated_at
  before update on interview_activities
  for each row execute function set_updated_at();

create trigger interview_records_set_updated_at
  before update on interview_records
  for each row execute function set_updated_at();
