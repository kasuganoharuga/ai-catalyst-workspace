-- "A failed Attempt can only be the basis of one Retry" is a business rule
-- (module_attempts_based_on_same_module_fk only guarantees the Retry
-- belongs to the same Module, not that it's the only Retry referencing a
-- given source Attempt). Enforced here as a partial unique index rather
-- than a Service-layer-only check, because two concurrent Retry creations
-- against the same rejected/validation_failed Attempt would otherwise both
-- pass a plain SELECT-based check (race).
create unique index module_attempts_based_on_unique
  on module_attempts (based_on_attempt_id)
  where based_on_attempt_id is not null;
