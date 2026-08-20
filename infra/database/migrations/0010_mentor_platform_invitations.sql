-- Mentor V1: a Mentor now exists *before* any Workspace does.
--
-- 0001 encoded the opposite order. Its comment on `invitations` reads
-- "mentor: invites a user to become the Mentor of a given Workspace", and
-- `invitations_workspace_target_check` enforced that literally:
--
--   (invite_role = 'founder' and workspace_id is null)
--   or (invite_role = 'mentor' and workspace_id is not null)
--
-- which presumes Founder registers -> Workspace exists -> a Mentor is then
-- attached to it. The product model is now the reverse: an Admin invites a
-- Mentor to the platform, that Mentor invites Founders, and each accepted
-- Founder Invitation creates the Workspace with `mentor_user_id` set to the
-- inviter. At the moment an Admin invites a brand-new Mentor there is no
-- Workspace to point at, so the row must carry a null `workspace_id` — and
-- a check constraint is enforced at INSERT time, so no amount of Service
-- layer care can work around it. (Pointing at some arbitrary existing
-- Workspace would be worse: a Mentor covers many, so any single choice is
-- fabricated data.)
--
-- Both meanings are now legal, and the original one is kept rather than
-- retired — an Admin reassigning a Mentor onto an existing Workspace is a
-- plausible future operation:
--
--   workspace_id null     -> platform-level: become a Mentor, covering
--                            nothing yet. What V1 uses.
--   workspace_id not null -> workspace-bound: take over this Workspace.
--                            Reserved; no code path writes it today.
--
-- Founder Invitations are unchanged: still always workspace-less.

alter table invitations
  drop constraint invitations_workspace_target_check;

alter table invitations
  add constraint invitations_workspace_target_check
    check (
      (
        invite_role = 'founder'
        and workspace_id is null
      )
      or
      invite_role = 'mentor'
    );


-- Relaxing the check above silently breaks the pending-Mentor dedupe.
--
-- 0001's index keys on (lower(trim(email)), workspace_id), and a Postgres
-- unique index treats nulls as distinct by default — so once platform-level
-- rows all carry workspace_id = null, every one of them is considered
-- unique and the index stops deduplicating entirely. An Admin clicking
-- "invite" five times for one email would mint five simultaneously valid
-- pending tokens.
--
-- `nulls not distinct` (Postgres 15+; this deployment runs 17) makes two
-- (same email, null) rows collide as intended, while workspace-bound rows
-- keep deduplicating per Workspace. One index covers both meanings, so
-- there is no second partial index to keep in sync.
--
-- Compare `invitations_pending_founder_unique`, which keys on the email
-- alone and was therefore never exposed to this.

drop index invitations_pending_mentor_unique;

create unique index invitations_pending_mentor_unique
  on invitations (lower(trim(email)), workspace_id)
  nulls not distinct
  where status = 'pending' and invite_role = 'mentor';


-- listMentorFounders' driving predicate. A Mentor covers many Workspaces
-- while most Workspaces have no Mentor at all, so this is partial —
-- `mentor_user_id is null` rows are never searched for.

create index workspaces_mentor_user_id_idx
  on workspaces (mentor_user_id)
  where mentor_user_id is not null;
