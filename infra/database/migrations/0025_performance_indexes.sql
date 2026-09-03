-- =========================================================
-- PERFORMANCE INDEXES FOR HOT QUERY PATHS
--
-- Seven indexes for query shapes that today fall through to a sequential
-- scan (or, worse, a seq scan under FOR UPDATE) because the existing
-- indexes don't match the predicate or sort key actually used. None of
-- these change behaviour — they only change the plan Postgres picks.
--
-- Plain `create index`, not `create index concurrently`: the migration
-- runner (packages/db/src/migrate.ts) wraps every file's SQL in a single
-- begin/commit, and Postgres rejects CONCURRENTLY inside a transaction
-- block. At current data volumes a plain build is sub-second. Also not
-- `if not exists` — the runner's checksum + schema_migrations bookkeeping
-- already guarantees once-only application, and `if not exists` would
-- silently mask a name collision with a hand-applied index in a live
-- environment, which is exactly the kind of drift you want to see.
-- =========================================================

-- 1. invitations: the email-family lock in acceptFounderInvitation /
-- acceptMentorInvitation (`where lower(trim(email)) = lower(trim($1))
-- order by id for update`) has neither `status = 'pending'` nor
-- `invite_role = ...` in its predicate, so it can't use either of the
-- existing partial unique indexes (invitations_pending_founder_unique,
-- invitations_pending_mentor_unique). Every accept locks the whole email
-- family via a sequential scan.
create index invitations_email_lower_idx
  on invitations (lower(trim(email)));

-- 2. invitations: expireStaleInvitations runs on every create and every
-- list (`where invite_role = $1 and status = 'pending' and expires_at <=
-- now()`), with no supporting index today.
create index invitations_pending_expiry_idx
  on invitations (invite_role, expires_at)
  where status = 'pending';

-- 3. invitations: listInvitations filters on invite_role and sorts on
-- (created_at desc, id desc); only idx_invitations_workspace
-- (workspace_id) exists. This index matches the sort key exactly, so the
-- list needs no separate sort node.
create index invitations_role_created_idx
  on invitations (invite_role, created_at desc, id desc);

-- 4. program_runs: there is no index on workspace_id at all today (only
-- idx_program_runs_venture_status on (venture_id, status), and the
-- one-active-per-venture unique index). This is the lookup that drives
-- every Mentor page (the founder-list lateral join) and every
-- workspace-scoped run resolution. `active_branch_id is not null` is
-- deliberately left out of the predicate so the same index also serves
-- run-module resolution call sites that don't filter on it.
create index program_runs_workspace_active_idx
  on program_runs (workspace_id, created_at desc)
  where status <> 'archived';

-- 5. module_attempts: the resume-context query is `select distinct on
-- (program_run_module_id) ... order by program_run_module_id,
-- attempt_number desc`. idx_module_attempts_module_status is keyed on
-- (program_run_module_id, status) — wrong second column for this sort,
-- so DISTINCT ON needs an explicit sort today. This index makes it an
-- index-ordered scan.
create index module_attempts_module_attempt_number_idx
  on module_attempts (program_run_module_id, attempt_number desc);

-- 6 & 7. users: only users_email_unique / users_email_normalized_unique
-- exist. Every admin query (listAdminUsers, listAssignableMentors, the
-- dashboard role/recency aggregates) filters on deleted_at is null and
-- either role or created_at, and today does so via a full table scan.
create index users_role_active_idx
  on users (role)
  where deleted_at is null;

create index users_created_active_idx
  on users (created_at desc)
  where deleted_at is null;
