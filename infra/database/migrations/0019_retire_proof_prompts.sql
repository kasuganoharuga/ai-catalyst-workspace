-- =========================================================
-- 0019_retire_proof_prompts.sql
--
-- Marks the Proof module's prompts dead in the catalog. They were
-- orphaned when Module 4 became Solution (see 0018 and
-- content/module-4.ts): evidence_facilitator and
-- evidence_artifact_generator have three published versions each and
-- zero module_prompt_bindings, so nothing can load them, but they still
-- read as live entries in the prompt catalog.
--
-- Only prompt_definitions.status is touched. The obvious move — retiring
-- the prompt_versions themselves — is refused by the
-- prompt_versions_freeze trigger:
--
--   cannot retire a mutable version directly; freeze it first
--
-- That invariant is deliberate: retirement is the end of the
-- freeze lifecycle, and freezing is a one-way door gated behind
-- db:freeze's explicit confirmations (see freeze-cli.ts). Freezing these
-- versions purely so they could then be retired would abuse that
-- mechanism to tidy rows that are already unreachable. The versions are
-- therefore left published/mutable and simply unbound, which is what
-- they are.
--
-- Archiving the definition is the supported way to say "not part of the
-- catalog any more" without touching version history.
-- =========================================================

update prompt_definitions
set status = 'archived', updated_at = now()
where prompt_key in ('evidence_facilitator', 'evidence_artifact_generator')
  and status <> 'archived'
  -- Never archive a definition something can still load.
  and not exists (
    select 1
    from prompt_versions v
    join module_prompt_bindings b on b.prompt_version_id = v.id
    where v.prompt_definition_id = prompt_definitions.id
  );
