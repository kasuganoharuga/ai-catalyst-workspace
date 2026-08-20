-- ---------------------------------------------------------
-- content_lock: orthogonal to `status`. Lets a `program_versions` /
-- `prompt_versions` row stay in `published` status (so resolver, catalog,
-- and Run creation are untouched) while its content is still being
-- actively edited in place ("living V1"). One-way: mutable -> frozen only.
--
-- Default 'frozen': every pre-existing row, and any row not explicitly
-- created as mutable by the seed script, lands on the conservative side.
-- Living content is an explicit opt-in, never an accidental default.
-- ---------------------------------------------------------

alter table program_versions
  add column content_lock text not null default 'frozen'
    check (content_lock in ('mutable', 'frozen'));

alter table prompt_versions
  add column content_lock text not null default 'frozen'
    check (content_lock in ('mutable', 'frozen'));

comment on column program_versions.content_lock is
  'Orthogonal to status. mutable = the content-seed reconciler may edit '
  'this version''s module/question/artifact/binding rows in place and '
  'existing Program Runs follow along via reconcileRunModules. One-way '
  'transition to frozen via the db:freeze CLI, guarded by '
  'program_versions_content_lock_guard.';

comment on column prompt_versions.content_lock is
  'Orthogonal to status. mutable = this prompt_versions row may still be '
  'edited in place even after status=published. One-way transition to '
  'frozen, guarded by prompt_versions_freeze. A prompt is global and may '
  'be frozen because a *different* program_version froze it (see the '
  'shared-prompt preflight in the db:freeze CLI) even while the '
  'program_version that is still iterating on it remains mutable.';

-- ---------------------------------------------------------
-- Only one mutable program_version per program at a time (DB invariant,
-- not just a seed-time check — a stray admin UPDATE or a future write
-- path must not be able to create two living versions of the same
-- Program).
-- ---------------------------------------------------------
create unique index program_versions_single_mutable
  on program_versions (program_id)
  where content_lock = 'mutable';

-- ---------------------------------------------------------
-- program_versions previously had no trigger at all. content_lock
-- introduces its own guard, kept deliberately parallel in structure and
-- error wording to prompt_versions_freeze() below:
--
--   1. content_lock is one-way (mutable -> frozen), never reopened.
--   2. content_lock must be changed in a UPDATE of its own — changing it
--      in the same statement as a business column would let
--      OLD.content_lock (still mutable) authorize the content edit while
--      the row exits as frozen in one atomic step, bypassing rule 3.
--   3. Content is immutable once frozen-while-published, or once
--      retired. retired always implies frozen (enforced below): the
--      lifecycle is published+mutable -> published+frozen -> retired,
--      never published+mutable -> retired directly.
-- ---------------------------------------------------------
create function program_versions_content_lock_guard()
returns trigger
language plpgsql
as $fn$
begin
  if old.content_lock = 'frozen' and new.content_lock <> 'frozen' then
    raise exception
      'program_versions %: content_lock is one-way (mutable -> frozen); a frozen version can never be reopened. Publish a new program_version instead.',
      old.id;
  end if;

  if new.content_lock is distinct from old.content_lock and (
       new.name           is distinct from old.name
    or new.description    is distinct from old.description
    or new.release_notes  is distinct from old.release_notes
    or new.status         is distinct from old.status
    or new.version_number is distinct from old.version_number
    or new.version_label  is distinct from old.version_label
  ) then
    raise exception
      'program_versions %: content_lock must be changed on its own, with no other column in the same UPDATE.',
      old.id;
  end if;

  if new.program_id       is distinct from old.program_id
     or new.version_number is distinct from old.version_number
     or new.created_at     is distinct from old.created_at then
    raise exception 'program_versions %: identity columns are immutable.', old.id;
  end if;

  -- status state machine: draft -> published -> retired, one-way.
  if not (
       (old.status = 'draft'     and new.status in ('draft', 'published'))
    or (old.status = 'published' and new.status in ('published', 'retired'))
    or (old.status = 'retired'   and new.status = 'retired')
  ) then
    raise exception
      'program_versions %: status can only move draft -> published -> retired.', old.id;
  end if;

  -- retired always implies frozen: published+mutable can never jump
  -- straight to retired, only published+frozen -> retired.
  if old.status = 'published' and old.content_lock = 'mutable'
     and new.status = 'retired' then
    raise exception
      'program_versions %: cannot retire a mutable version directly; freeze it first (pnpm db:freeze).',
      old.id;
  end if;

  -- frozen + published/retired: catalog copy is immutable too (DB-level
  -- backstop for what upsertProgramVersion already enforces in the seed
  -- script for a *mutable* row that later became frozen).
  if old.content_lock = 'frozen' and old.status in ('published', 'retired') and (
       new.name          is distinct from old.name
    or new.description   is distinct from old.description
    or new.release_notes is distinct from old.release_notes
  ) then
    raise exception
      'program_versions %: frozen published content cannot be modified.', old.id;
  end if;

  return new;
end;
$fn$;

create trigger program_versions_content_lock_guard
  before update on program_versions
  for each row execute function program_versions_content_lock_guard();

-- ---------------------------------------------------------
-- Rewrite prompt_versions_freeze(): the condition under which `content` /
-- `content_format` / `variable_config` become immutable moves from
-- "status = published/retired" to "content_lock = frozen, or retired".
-- mutable + published is the living-V1 steady state and is now allowed.
-- Everything else (status state machine, identity/publication columns,
-- retired read-only) is unchanged from 0001.
-- ---------------------------------------------------------
create or replace function prompt_versions_freeze()
returns trigger
language plpgsql
as $fn$
begin
  if old.content_lock = 'frozen' and new.content_lock <> 'frozen' then
    raise exception
      'prompt_versions %: content_lock is one-way (mutable -> frozen).', old.id;
  end if;

  if new.content_lock is distinct from old.content_lock and (
       new.content         is distinct from old.content
    or new.content_format  is distinct from old.content_format
    or new.variable_config is distinct from old.variable_config
    or new.status          is distinct from old.status
  ) then
    raise exception
      'prompt_versions %: content_lock must be changed on its own, with no other column in the same UPDATE.',
      old.id;
  end if;

  -- State machine: draft -> published -> retired, no rollback allowed.
  if not (
       (old.status = 'draft'
        and new.status in ('draft', 'published'))
    or (old.status = 'published'
        and new.status in ('published', 'retired'))
    or (old.status = 'retired'
        and new.status = 'retired')
  ) then
    raise exception
      'prompt_versions %: status can only move draft -> published -> retired, no skipping or rollback',
      old.id;
  end if;

  -- retired always implies frozen, same rule as program_versions above.
  if old.status = 'published' and old.content_lock = 'mutable'
     and new.status = 'retired' then
    raise exception
      'prompt_versions %: cannot retire a mutable version directly; freeze it first.',
      old.id;
  end if;

  -- Identity + publication signature: frozen once left draft, regardless
  -- of content_lock.
  if old.status <> 'draft' and (
       new.prompt_definition_id is distinct from old.prompt_definition_id
    or new.version_number       is distinct from old.version_number
    or new.created_by_user_id   is distinct from old.created_by_user_id
    or new.published_by_user_id is distinct from old.published_by_user_id
    or new.published_at         is distinct from old.published_at
    or new.created_at           is distinct from old.created_at
  ) then
    raise exception
      'prompt_versions %: identity/publication columns are immutable once published.', old.id;
  end if;

  -- ** Core change **: content immutability now keys off content_lock,
  -- not status. mutable + published is the living-V1 steady state and is
  -- explicitly allowed to fall through here.
  if (old.status = 'retired'
      or (old.status = 'published' and old.content_lock = 'frozen'))
     and (
       new.content         is distinct from old.content
    or new.content_format  is distinct from old.content_format
    or new.variable_config is distinct from old.variable_config
     )
  then
    raise exception
      'prompt_versions %: frozen/retired version content cannot be modified, please create a new version',
      old.id;
  end if;

  if old.status = 'retired'
     and new.retired_at is distinct from old.retired_at then
    raise exception 'prompt_versions %: retired version is read-only', old.id;
  end if;

  return new;
end;
$fn$;
