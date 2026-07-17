-- 0001's program_runs table constrains uniqueness on
-- (venture_id, program_version_id, run_number), but the product rule is
-- "one non-archived Run per Venture" — a Venture must not be able to have
-- two Runs open (draft/active/paused/completed) at once, regardless of
-- which program_version_id each is bound to. A plain unique constraint on
-- venture_id can't express that (it would also block an *archived* Run
-- from ever coexisting with a new one), so this is a partial unique index
-- instead — the same technique already called out for company_profiles in
-- 0001's comments, applied here for real.
create unique index program_runs_one_active_per_venture
  on program_runs (venture_id)
  where status <> 'archived';
