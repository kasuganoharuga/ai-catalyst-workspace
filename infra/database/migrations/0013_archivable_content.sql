-- ---------------------------------------------------------
-- artifact_definitions gets a status column, mirroring
-- module_definitions/module_questions. Two states only (active/archived),
-- not three: every read path below filters `status <> 'archived'` (i.e.
-- draft and active would be indistinguishable), and unlike
-- module_definitions there is no publish step that activates a draft
-- artifact_definitions row — publishProgramVersion's Step 2/8 only ever
-- touch module_definitions.status. A third state with nothing to move it
-- out of would just be a landmine.
--
-- artifact_definitions cannot be hard-deleted the way module_prompt_bindings
-- is: it's the target of artifact_submissions' composite foreign key
-- (artifact_definitions(id, module_definition_id)), so deleting a row a
-- founder has already submitted against would cascade-delete their
-- submission history.
-- ---------------------------------------------------------
alter table artifact_definitions
  add column status text not null default 'active'
    check (status in ('active', 'archived'));

comment on column artifact_definitions.status is
  'active|archived only (no draft — nothing activates it). archived rows '
  'are kept for artifact_submissions history and may be revived by the '
  'content-seed reconciler with their id unchanged; runtime read paths '
  'must filter status <> ''archived''.';

-- ---------------------------------------------------------
-- Convert the three content-definition sequence_index uniqueness
-- constraints to partial unique indexes that exclude archived rows.
--
-- This is what makes archive-then-revive-at-a-different-sequence
-- possible without a temporary-range shuffle for every single edit: an
-- archived row simply isn't part of the uniqueness competition, so a
-- still-active sibling can occupy its old sequence_index immediately.
-- (Reconciling a *revived* row back into a specific sequence_index still
-- needs the temporary-range algorithm in reconcile-ordered-rows.ts,
-- because two still-archived-at-the-time-of-the-shift rows can't help
-- that collision — see that file's comments.)
--
-- Deliberately not `deferrable initially immediate`: a deferrable
-- constraint can't be partial (partial is an index-only concept), and
-- archive semantics need the partial predicate more than they need
-- statement-level deferral.
--
-- Row identity (module_definitions_key_unique / module_questions'
-- equivalent / artifact_definitions_key_unique) stays a FULL, non-partial
-- unique index unchanged from 0001: the content-seed reconciler looks up
-- an archived row by key to revive it in place (same id), so two rows
-- must never be allowed to share a key even when one is archived.
--
-- FK-target uniqueness constraints (module_definitions_id_version_unique,
-- artifact_definitions_id_module_unique, and everything under
-- program_run_modules) are untouched — those close the loop for other
-- tables' composite foreign keys and archiving a definition must not
-- affect them.
-- ---------------------------------------------------------
alter table module_definitions
  drop constraint module_definitions_sequence_unique;
create unique index module_definitions_sequence_unique
  on module_definitions (program_version_id, sequence_index)
  where status <> 'archived';

alter table module_questions
  drop constraint module_questions_sequence_unique;
create unique index module_questions_sequence_unique
  on module_questions (module_definition_id, sequence_index)
  where status <> 'archived';

alter table artifact_definitions
  drop constraint artifact_definitions_sequence_unique;
create unique index artifact_definitions_sequence_unique
  on artifact_definitions (module_definition_id, sequence_index)
  where status <> 'archived';
