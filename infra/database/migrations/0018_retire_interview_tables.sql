-- =========================================================
-- 0018_retire_interview_tables.sql
--
-- Retires the structured interview intake introduced in 0014.
--
-- Interview material now arrives the same way every other Founder
-- document does: uploaded on a Module's Work step into
-- module_prep_documents (0017), stored as-is, and read by the assistant
-- through get_module_context / get_prep_document. There is no website
-- form, no five-interview floor enforced in the database, and no
-- confirmed-evidence artifact pinned onto an attempt.
--
-- Dropped rather than left in place because the application code that
-- wrote and read these tables is gone: packages/services/src/interview/,
-- the Module 4 evidence panel, and the /artefacts/interviews pages. A
-- table only reachable by hand is worse than no table — it reads as
-- current state to the next person.
--
-- Deliberately destructive. Any interview records captured under the old
-- flow are not migrated into module_prep_documents: those rows are
-- structured per-question answers, while prep documents are files, and
-- there is no honest automatic conversion between the two. Export before
-- running this if that history matters.
-- =========================================================

-- The pin first: module_attempts references artifact_submissions here,
-- and Module 4 completion no longer requires (or checks) it.
alter table module_attempts
  drop column if exists source_interview_evidence_artifact_id;

-- interview_records references interview_activities, so it goes first.
drop table if exists interview_records;
drop table if exists interview_activities;
