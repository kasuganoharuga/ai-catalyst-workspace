-- =========================================================
-- 0021_module_prep_document_interview_kind.sql
--
-- Reintroduces a narrow, counted floor on interview material for Module 4
-- only — not a return to the structured interview_activities/
-- interview_records tables 0018 retired. Those tables held per-question
-- interview answers with a website form in front of them; this migration
-- adds nothing but a classification and a count on the existing
-- module_prep_documents row, so 0018's reasoning ("no website form, no
-- confirmed-evidence artifact pinned onto an attempt") still holds. A
-- prep document is still just a file or a chat-shared extract.
--
-- document_kind distinguishes an interview transcript from any other prep
-- material (a pitch deck, research notes, etc.) sharing the same table.
-- Without it, a floor on "5 confirmed interviews" would have to guess from
-- filenames or notes — exactly the kind of heuristic this codebase's
-- comments elsewhere refuse to accept.
--
-- interview_count is an integer, not a boolean, because a Founder may
-- paste several interviews into one shared document. The assistant is
-- responsible for reading the text, separating the distinct interviews it
-- contains, and reporting the true count in this column — one row can
-- represent more than one interview.
-- =========================================================

alter table module_prep_documents
  add column document_kind text not null default 'other'
  check (document_kind in ('interview_transcript', 'other'));

alter table module_prep_documents
  add column interview_count integer
  check (
    (document_kind = 'interview_transcript' and interview_count >= 1)
    or (document_kind <> 'interview_transcript' and interview_count is null)
  );
