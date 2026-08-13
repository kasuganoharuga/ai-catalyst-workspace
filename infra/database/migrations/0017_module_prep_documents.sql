-- =========================================================
-- 0017_module_prep_documents.sql
--
-- Founder-uploaded prep material for the Work step (step 2) of every
-- standard Module: files the Founder hands over before "Continue in
-- Claude" so the facilitator can read them at open.
--
-- Scoped to program_run_modules, not module_attempts, on purpose. The
-- upload window sits on the Work card and is usable before Claude has
-- ever started — at which point no module_attempt row exists yet. This
-- mirrors interview_activities, which is program-run scoped for the same
-- reason and only pins onto an attempt later.
--
-- The bytes live in storage_objects (pending → uploaded → verified).
-- This table is the join plus the founder-facing metadata: what the file
-- is for, and whether it has been withdrawn. Nothing here holds extracted
-- text — parsing is the reading client's job, so the record stays a
-- pointer to the file rather than a second, staler copy of its content.
-- =========================================================

create table module_prep_documents (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references workspaces(id) on delete cascade,

  -- The run's instance of one Module. Uniquely identifies "the Work step
  -- the Founder was looking at" without needing an attempt.
  program_run_module_id uuid not null,

  storage_object_id uuid not null,

  -- Denormalised from storage_objects so listing a Work step never has to
  -- join storage just to render a filename, and so the founder-visible
  -- label survives independently of how the object was stored.
  original_filename text not null
    check (length(trim(original_filename)) > 0),

  content_type text not null,

  -- Optional one-line note from the Founder ("interview 3, ran long").
  -- Never AI-authored.
  note text not null default '',

  -- Soft withdrawal: the Founder removed it from the Work step. Kept as a
  -- row so an attempt that already read the file has a stable audit trail
  -- of what was visible at the time.
  withdrawn_at timestamptz,

  uploaded_by_user_id uuid
    references users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint module_prep_documents_run_module_fk
    foreign key (program_run_module_id, workspace_id)
    references program_run_modules (id, workspace_id)
    on delete cascade,

  constraint module_prep_documents_storage_fk
    foreign key (storage_object_id, workspace_id)
    references storage_objects (id, workspace_id)
    on delete restrict,

  -- One prep row per stored object: re-uploading the same bytes under a
  -- new name creates a new storage_object, so this never collapses two
  -- deliberate uploads into one.
  constraint module_prep_documents_storage_unique
    unique (storage_object_id),

  constraint module_prep_documents_id_workspace_unique
    unique (id, workspace_id)
);

-- Listing the Work step: every live document for one run module.
create index module_prep_documents_run_module_idx
  on module_prep_documents (program_run_module_id)
  where withdrawn_at is null;

create index module_prep_documents_workspace_id_idx
  on module_prep_documents (workspace_id);
