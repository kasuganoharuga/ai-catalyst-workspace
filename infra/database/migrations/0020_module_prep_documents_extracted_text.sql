-- =========================================================
-- 0020_module_prep_documents_extracted_text.sql
--
-- Adds a second way to populate module_prep_documents: instead of the
-- Founder uploading a file on the website (storage_object_id path), the
-- AI assistant reads a file the Founder shared directly in chat and
-- persists a faithful transcription of it through save_prep_extract
-- (extracted_text path). This is the one deliberate exception to 0017's
-- "nothing here holds extracted text" rule: for Modules that drop the
-- website Documents step entirely (Module 1, now Module 2), there is no
-- uploaded file for extracted_text to be a second copy of — it is the
-- only copy. Modules that still offer the website upload keep using the
-- storage_object_id path, where 0017's original rule still applies
-- untouched.
--
-- extracted_text is deliberately not called summary_text: the assistant
-- is instructed to transcribe the original text faithfully, not condense
-- it — there is no second copy to fall back on if it compresses away a
-- detail the source captured.
--
-- Exactly one of storage_object_id / extracted_text is set per row, never
-- both and never neither, so every existing query that assumed
-- storage_object_id is always present must now branch on which path a
-- given row took.
-- =========================================================

alter table module_prep_documents
  alter column storage_object_id drop not null;

alter table module_prep_documents
  add column extracted_text text;

alter table module_prep_documents
  add constraint module_prep_documents_source_xor
  check (
    (storage_object_id is not null and extracted_text is null)
    or (storage_object_id is null and extracted_text is not null and length(trim(extracted_text)) > 0)
  );
