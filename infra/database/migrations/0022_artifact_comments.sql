-- =========================================================
-- ARTIFACT COMMENT THREADS / COMMENTS / READS
--
-- Founder <-> Mentor discussion on one confirmed Artifact — a Founder and
-- any Mentor can open a thread anchored to a heading (or the whole
-- document), and reply. Distinct from module_review_context_snapshots
-- (a frozen, immutable snapshot generated at submission time) and from
-- module_attempts.review_notes (a single unused free-text field) — this is
-- the actual, previously entirely unbuilt review-discussion feature.
--
-- Anchoring is by heading, not by character offset or version: Artifacts
-- are immutable per version, but a Founder re-saving under the same
-- headings (the requiredSections drift-tested contract renderers already
-- rely on) keeps a thread anchored to the same conceptual place across
-- versions. opened_on_version / written_on_version record which version a
-- thread/comment was authored against, for display ("commented on v3,
-- viewing v4") — they are provenance, not a positioning mechanism.
--
-- Threads are keyed on (module_attempt_id, artifact_definition_id), not
-- artifact_submissions.id: a new confirmed version must not orphan
-- existing discussion, and a Retry (a new Attempt) correctly starts a new,
-- empty set of threads — a Retry is a new attempt at the work, not a
-- continuation of the old one's discussion.
-- =========================================================

create table artifact_comment_threads (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null,

  module_attempt_id uuid not null,

  -- Redundant columns closing the same composite foreign key loop
  -- artifact_submissions uses: guarantees the Artifact Definition belongs
  -- to the Module the Attempt is in.
  program_run_module_id uuid not null,
  module_definition_id uuid not null,

  artifact_definition_id uuid not null,

  anchor_kind text not null
    check (
      anchor_kind in (
        'document',
        'section'
      )
    ),

  -- Set together with anchor_heading for anchor_kind = 'section'; both
  -- null for anchor_kind = 'document'. Enforced below.
  anchor_heading_level integer
    check (
      anchor_heading_level is null
      or anchor_heading_level between 1 and 6
    ),
  anchor_heading text,

  -- Display-only excerpt of the anchored text at thread-creation time —
  -- never used to relocate the anchor. A later version may reword or
  -- remove the sentence entirely; the thread stays anchored to the heading.
  anchor_quote text
    check (
      anchor_quote is null
      or length(anchor_quote) <= 500
    ),

  opened_on_version integer not null
    check (opened_on_version > 0),

  status text not null default 'open'
    check (
      status in (
        'open',
        'resolved'
      )
    ),

  resolved_by_user_id uuid
    references users(id),
  resolved_at timestamptz,

  created_by_user_id uuid not null
    references users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint artifact_comment_threads_section_anchor_complete
    check (
      (
        anchor_kind = 'document'
        and anchor_heading is null
        and anchor_heading_level is null
      )
      or (
        anchor_kind = 'section'
        and anchor_heading is not null
        and anchor_heading_level is not null
      )
    ),

  constraint artifact_comment_threads_resolved_fields
    check (
      (
        status = 'open'
        and resolved_by_user_id is null
        and resolved_at is null
      )
      or (
        status = 'resolved'
        and resolved_by_user_id is not null
        and resolved_at is not null
      )
    ),

  -- Same composite foreign key loop as artifact_submissions
  -- (0001_aidb_v5_baseline.sql) — guarantees the Attempt, Run Module,
  -- Module Definition and Artifact Definition are all mutually consistent.
  constraint artifact_comment_threads_attempt_workspace_fk
    foreign key (
      module_attempt_id,
      workspace_id
    )
    references module_attempts (
      id,
      workspace_id
    )
    on delete cascade,

  constraint artifact_comment_threads_attempt_module_fk
    foreign key (
      module_attempt_id,
      program_run_module_id
    )
    references module_attempts (
      id,
      program_run_module_id
    ),

  constraint artifact_comment_threads_run_module_definition_fk
    foreign key (
      program_run_module_id,
      module_definition_id
    )
    references program_run_modules (
      id,
      module_definition_id
    ),

  constraint artifact_comment_threads_definition_module_fk
    foreign key (
      artifact_definition_id,
      module_definition_id
    )
    references artifact_definitions (
      id,
      module_definition_id
    ),

  constraint artifact_comment_threads_id_workspace_unique
    unique (
      id,
      workspace_id
    )
);

-- Mentor's "every Founder's open threads" surface and the artefact page's
-- own thread list both filter on this pair.
create index artifact_comment_threads_attempt_artifact_idx
  on artifact_comment_threads (module_attempt_id, artifact_definition_id);


create table artifact_comments (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null,

  thread_id uuid not null,

  author_user_id uuid not null
    references users(id),

  -- Denormalised at write time — role fixed to what it was when the
  -- comment was written, so a subsequent role change (or, for Mentor
  -- read-scope, MENTOR_SEES_ALL_FOUNDERS toggling) can never rewrite who
  -- a past comment displays as having come from.
  author_role text not null
    check (
      author_role in (
        'founder',
        'mentor',
        'admin'
      )
    ),

  body text not null
    check (
      length(trim(body)) > 0
      and length(body) <= 4000
    ),

  written_on_version integer not null
    check (written_on_version > 0),

  edited_at timestamptz,
  deleted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint artifact_comments_thread_workspace_fk
    foreign key (
      thread_id,
      workspace_id
    )
    references artifact_comment_threads (
      id,
      workspace_id
    )
    on delete cascade
);

create index artifact_comments_thread_created_idx
  on artifact_comments (thread_id, created_at);


-- Per-(thread, user) "last time this user looked at this thread" — derives
-- unread badges. Not workspace-scoped: authorization for whether a user may
-- touch a given thread at all is the thread's own Founder/Mentor scoping
-- check, not this table.
create table artifact_comment_reads (
  thread_id uuid not null
    references artifact_comment_threads(id)
    on delete cascade,

  user_id uuid not null
    references users(id)
    on delete cascade,

  last_read_at timestamptz not null default now(),

  primary key (thread_id, user_id)
);


-- Extends module_events for the two new observable transitions this
-- feature introduces. Same drop + re-add pattern as
-- 0016_module_events_observability.sql.
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
      'workflow_state_inconsistency_detected',
      'artifact_comment_added',
      'artifact_comment_resolved'
    )
  );
