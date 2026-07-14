-- =========================================================
-- AI Catalyst Database Schema（V2 · 第 3 次修订）
-- 已在 PostgreSQL 16 完整执行并通过约束冒烟测试
--
-- 应用层配套要求（数据库无法单独保证，必须同步落实）：
--
-- 1. Better Auth 配置：
--    - uuid 主键；表名映射 users / sessions / accounts / verifications
--    - 字段逐个映射：emailVerified → email_verified、
--      userId → user_id、expiresAt → expires_at 等
--    - role 声明为 additionalFields 且 input: false，由 hook 写入
--    - 开启 account.encryptOAuthTokens
--    - 执行 npx @better-auth/cli generate，与本 schema diff 核对
--
-- 2. 用户删除：仅软删除（users.deleted_at），禁止 hard delete；
--    触发器已联动：置删除时撤销全部 Sessions、
--    拒绝已删除用户创建新 Session；
--    Auth Middleware 仍需拦截 Cookie 缓存 / JWT 与 OAuth 登录
--
-- 3. user_active_contexts 仅为界面选择，不作为权限依据；
--    授权必须校验 workspaces.founder/mentor_user_id 与 users.role；
--    Service 层统一执行 Workspace Scope，条件允许再加 RLS
--
-- 4. 不可变性规则：draft 可改；published 不可改只能新版本；retired 只读
--    - prompt_versions / workflow_definitions / workflow_steps /
--      module_responses / module_review_context_snapshots：触发器已保证
--      （含状态机 draft → published → retired，禁止回退与归属迁移）
--    - program_versions / module_definitions / artifact_definitions /
--      module_questions / prompt bindings：由 Service 层保证
--
-- 5. 后端单一事务保证的状态一致性（外键无法表达）：
--    - 分叉来源 Module 已 completed、来源 Attempt 已 accepted
--    - program_run_modules.accepted_attempt_id 指向 accepted Attempt
--    - inherited 来源属于 Parent Branch
--    - Branch 切换：目标 status = open、Run 状态允许切换
--    - active_attempt_id 指向活动状态
--      （draft / in_progress / submitted / ready_for_review）的 Attempt
--    - Attempt 创建：Workflow 属于当前 Module 且已 published、
--      Entry / Next / Failure Step 可达且无意外死循环、
--      绑定的 Prompt Version 均已 published
--    - Program Run 创建：只绑定 published 的 Program Version
--    - Parent Branch 防环（A→B→A），parent.branch_number < child
--
-- 6. 业务层禁止 hard delete：
--    workspaces / ventures / program_runs / program_run_branches /
--    program_run_modules / module_attempts / artifact_submissions
--    等核心与历史表只允许 archived / abandoned / cancelled /
--    deleted 等状态流转；建议按文末「权限收敛模板」
--    收回应用账号的 DELETE 权限，仅 Migration / Admin 账号保留。
--
-- 7. Invitation 接受必须在同一事务内完成：
--    锁定 Invitation → 检查 status = pending 且未过期 →
--    标准化后比较 Invitation Email 与 User Email →
--    升级 User Role →（Founder 创建 Workspace /
--    Mentor 绑定目标 Workspace）→
--    写入 accepted_by_user_id / accepted_at / status = accepted →
--    撤销同邮箱其他 pending Invitation。
--    避免 accepted 但 role 仍 pending、role 已升级但
--    Workspace 未创建 / 未绑定等中间态。
-- =========================================================

-- 下面是 User / Auth / Invitation / Workspace / Active Context / AI Connection 整个板块的表。Better Auth 核心认证表为 users、sessions、accounts、verifications；启用 OAuth Provider 后产生的额外认证表，后续应由 Better Auth CLI 根据实际插件配置生成

-- 本版为修订版：全库用户外键统一为 uuid → users(id)（Better Auth 需配置 uuid 主键，并将表名映射为 users / sessions / accounts / verifications）；循环依赖或建表顺序受限的外键统一放在文末「后置外键」段。

-- section 1
-- =========================================================
-- 1. USERS
-- Better Auth 核心用户表
--
-- name 初始等于 email，允许用户或 OAuth 后续修改显示名
--
-- role 是平台级角色：
-- pending：已注册但尚未接受 Invitation，无任何业务权限
-- founder：Founder 用户
-- mentor：Mentor 用户
-- admin：平台管理员
--
-- 失败关闭：默认 pending，不会误创建 Founder；
-- 接受 Invitation 后由后端在同一事务内升级 role。
-- Email/Password 与 OAuth 注册均须验证 Invitation。
--
-- role 由后端 / Invitation 决定：
-- Better Auth 中声明为 additionalFields 且 input: false，
-- 通过 database hook 写入，禁止客户端注册时提交；
-- OAuth 隐式注册需先验证 Invitation。
--
-- 软删除：deleted_at 非空即视为已删除。
-- 禁止 Better Auth hard delete（历史记录大量引用本表）。
-- =========================================================

create table users (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  email text not null,
  email_verified boolean not null default false,

  role text not null default 'pending'
    check (
      role in (
        'pending',
        'founder',
        'mentor',
        'admin'
      )
    ),

  image text,

  deleted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint users_email_unique
    unique (email)
);

-- 大小写不敏感的邮箱唯一性
-- （users_email_unique 保留用于 Better Auth 精确等值查询）
create unique index users_email_normalized_unique
  on users (lower(trim(email)));


-- =========================================================
-- 2. SESSIONS
-- Better Auth 网站登录 Session
-- =========================================================

create table sessions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references users(id) on delete cascade,

  token text not null,
  expires_at timestamptz not null,

  ip_address text,
  user_agent text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sessions_token_unique
    unique (token)
);


-- =========================================================
-- 3. ACCOUNTS
-- Better Auth 登录方式
--
-- 例如：
-- credential
-- google
-- microsoft
--
-- 注意：access_token / refresh_token / id_token
-- 必须在 Better Auth 开启 account.encryptOAuthTokens 加密存储；
-- "不保存明文 OAuth Token" 不能只靠 user_ai_connections 实现
-- =========================================================

create table accounts (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references users(id) on delete cascade,

  account_id text not null,
  provider_id text not null,

  access_token text,
  refresh_token text,
  id_token text,

  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,

  scope text,

  -- Email + Password 登录时保存密码 Hash
  password text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint accounts_provider_account_unique
    unique (provider_id, account_id)
);


-- =========================================================
-- 4. VERIFICATIONS
-- Better Auth 临时验证记录
--
-- 用于：
-- 邮箱验证
-- 密码重置
-- Magic Link
--
-- 不用于平台 Invitation
-- =========================================================

create table verifications (
  id uuid primary key default gen_random_uuid(),

  identifier text not null,
  value text not null,
  expires_at timestamptz not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- =========================================================
-- 5. USER PROFILES
-- AI Catalyst 用户业务资料
--
-- contact_email 为空时：
-- 业务层默认使用 users.email
-- =========================================================

create table user_profiles (
  user_id uuid primary key
    references users(id) on delete cascade,

  first_name text,
  last_name text,

  contact_email text,

  -- 用户选择使用的 AI 平台，决定网站引导界面
  preferred_ai_provider text
    check (
      preferred_ai_provider is null
      or preferred_ai_provider in (
        'claude',
        'openai'
      )
    ),

  -- FK → storage_objects(id)
  -- 在文末「后置外键」统一添加
  avatar_storage_object_id uuid,

  job_title text,
  bio text,
  linkedin_url text,

  locale text not null default 'en-AU',

  last_active_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_profiles_first_name_not_blank
    check (
      first_name is null
      or length(trim(first_name)) > 0
    ),

  constraint user_profiles_last_name_not_blank
    check (
      last_name is null
      or length(trim(last_name)) > 0
    ),

  constraint user_profiles_contact_email_not_blank
    check (
      contact_email is null
      or length(trim(contact_email)) > 0
    )
);


-- =========================================================
-- 6. WORKSPACES
--
-- 当前业务规则：
-- 每个 Workspace 必须有一个 Founder
-- 每个 Workspace 最多有一个 Mentor
-- 每个 Founder 只能拥有一个 Workspace
-- Mentor 可以负责多个 Workspace
-- Admin 不需要关联具体 Workspace
-- =========================================================

create table workspaces (
  id uuid primary key default gen_random_uuid(),

  founder_user_id uuid not null
    references users(id),

  mentor_user_id uuid
    references users(id),

  name text not null,
  slug text not null,

  status text not null default 'active'
    check (
      status in (
        'active',
        'suspended',
        'archived'
      )
    ),

  -- FK → storage_objects(id)
  -- 在文末「后置外键」统一添加
  logo_storage_object_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,

  constraint workspaces_slug_unique
    unique (slug),

  constraint workspaces_founder_unique
    unique (founder_user_id),

  constraint workspaces_founder_not_mentor
    check (
      mentor_user_id is null
      or mentor_user_id <> founder_user_id
    )
);


-- =========================================================
-- 7. INVITATIONS
--
-- invite_role：
-- founder：邀请用户注册成为 Founder
-- mentor：邀请用户成为某个 Workspace 的 Mentor
--
-- Founder Invitation：
-- workspace_id 必须为空
--
-- Mentor Invitation：
-- workspace_id 必须有值
-- =========================================================

create table invitations (
  id uuid primary key default gen_random_uuid(),

  email text not null,

  invite_role text not null
    check (
      invite_role in (
        'founder',
        'mentor'
      )
    ),

  -- Mentor Invitation 必须关联 Workspace
  -- Founder Invitation 不关联 Workspace
  workspace_id uuid
    references workspaces(id) on delete cascade,

  -- 数据库只保存 Token Hash
  -- 原始 Token 只放在邀请链接中
  token_hash text not null,

  invited_by_user_id uuid
    references users(id),

  -- 如果被邀请邮箱已经注册，可以提前关联
  invited_user_id uuid
    references users(id),

  status text not null default 'pending'
    check (
      status in (
        'pending',
        'accepted',
        'revoked',
        'expired'
      )
    ),

  expires_at timestamptz not null,

  accepted_by_user_id uuid
    references users(id),

  accepted_at timestamptz,

  revoked_by_user_id uuid
    references users(id),

  revoked_at timestamptz,

  last_sent_at timestamptz,

  send_count integer not null default 0
    check (send_count >= 0),

  personal_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint invitations_token_hash_unique
    unique (token_hash),

  constraint invitations_workspace_target_check
    check (
      (
        invite_role = 'founder'
        and workspace_id is null
      )
      or
      (
        invite_role = 'mentor'
        and workspace_id is not null
      )
    )
);

-- 同一邮箱同一 Workspace 只允许一条 pending Mentor 邀请
create unique index invitations_pending_mentor_unique
  on invitations (lower(trim(email)), workspace_id)
  where status = 'pending' and invite_role = 'mentor';

-- 同一邮箱只允许一条 pending Founder 邀请
create unique index invitations_pending_founder_unique
  on invitations (lower(trim(email)))
  where status = 'pending' and invite_role = 'founder';


-- =========================================================
-- 8. USER ACTIVE CONTEXTS
--
-- 记录用户当前激活的 Workspace 和 Venture。
--
-- Founder：active_workspace 固定为自己的 Workspace，
--          切换 Venture 时更新 active_venture_id。
-- Mentor： 可在多个 Workspace 之间切换。
-- Admin：  两者均可为空。
--
-- 仅记录界面当前选择，不作为权限依据；
-- 授权必须校验 workspaces.founder/mentor_user_id 与 users.role。
-- =========================================================

create table user_active_contexts (
  user_id uuid primary key
    references users(id) on delete cascade,

  active_workspace_id uuid
    references workspaces(id),

  -- FK (active_venture_id, active_workspace_id)
  -- → ventures(id, workspace_id)
  -- 在文末「后置外键」统一添加，
  -- 保证 Venture 属于当前激活的 Workspace
  active_venture_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_active_contexts_venture_requires_workspace
    check (
      active_venture_id is null
      or active_workspace_id is not null
    )
);


-- =========================================================
-- 9. USER AI CONNECTIONS
--
-- 记录用户是否连接：
-- claude
-- openai（即 ChatGPT，与全库 provider 枚举统一使用 openai）
--
-- 不在这里保存明文 OAuth Access Token 或 Refresh Token
-- =========================================================

create table user_ai_connections (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references users(id) on delete cascade,

  provider text not null
    check (
      provider in (
        'claude',
        'openai'
      )
    ),

  external_subject_id text,

  status text not null default 'connected'
    check (
      status in (
        'connected',
        'expired',
        'revoked'
      )
    ),

  granted_scopes text[] not null default '{}',

  connected_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_ai_connections_user_provider_unique
    unique (user_id, provider),

  constraint user_ai_connections_provider_subject_unique
    unique (provider, external_subject_id)
);

-- section 2

-- =========================================================
-- 1. VENTURES
--
-- Founder 正在验证的 Idea。
-- 不要求已经成立公司。
-- 一个 Workspace 可以创建多个 Venture。
-- 当前使用哪个 Venture，由 user_active_contexts 决定。
-- =========================================================

create table ventures (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references workspaces(id) on delete cascade,

  created_by_user_id uuid not null
    references users(id),

  -- 用户可见的 Idea 名称
  name text not null,

  -- Workspace 内 URL 标识
  slug text not null,

  -- 简短的一句话介绍
  one_liner text,

  -- 对 Idea 的基础描述
  summary text,

  -- Idea 当前发展阶段
  lifecycle_stage text not null default 'idea'
    check (
      lifecycle_stage in (
        'idea',
        'validating',
        'validated',
        'company_formed'
      )
    ),

  -- Idea 当前是否仍在使用
  status text not null default 'active'
    check (
      status in (
        'active',
        'paused',
        'abandoned',
        'archived'
      )
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  paused_at timestamptz,
  abandoned_at timestamptz,
  archived_at timestamptz,

  constraint ventures_workspace_slug_unique
    unique (workspace_id, slug),

  -- 用于其他表通过 venture_id + workspace_id
  -- 确保 Venture 属于正确的 Workspace
  constraint ventures_id_workspace_unique
    unique (id, workspace_id),

  constraint ventures_name_not_blank
    check (length(trim(name)) > 0),

  constraint ventures_slug_not_blank
    check (length(trim(slug)) > 0)
);

-- =========================================================
-- 2. COMPANY PROFILES
--
-- Venture 对应的可选 Company Profile。
--
-- Idea 验证阶段可以不存在。
-- Venture 逐渐成为正式公司后再创建。
--
-- 一个 Venture 最多一条 Company Profile。
-- 一个 Workspace 最多一条 Company Profile
-- （对应"一个 Founder 只有一个正式公司"；
--  多个待验证 Venture 中最多一个转化为公司）。
-- =========================================================

create table company_profiles (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null,

  venture_id uuid not null,

  name text not null,

  website_url text,
  linkedin_url text,

  -- 一句话定位（卡片、匹配摘要使用）
  one_liner text,

  -- 完整公司描述
  description text,

  -- ISO 国家代码，例如 'AU'
  hq_country text,

  -- 州 / 地区，例如 'SA'
  hq_state text,

  hq_city text,
  hq_street text,
  hq_postal_code text,

  -- rtrim 去掉末尾多余的 ", "
  hq_address_full text generated always as (
    rtrim(
      coalesce(hq_street || ', ', '') ||
      coalesce(hq_city || ', ', '') ||
      coalesce(hq_state || ', ', '') ||
      coalesce(hq_postal_code || ', ', '') ||
      coalesce(hq_country, ''),
      ', '
    )
  ) stored,

  founded_year integer
    check (
      founded_year is null
      or founded_year between 1800 and 2100
    ),

  status text not null default 'active'
    check (
      status in (
        'active',
        'archived'
      )
    ),

  archived_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint company_profiles_venture_workspace_fk
    foreign key (
      venture_id,
      workspace_id
    )
    references ventures (
      id,
      workspace_id
    )
    on delete cascade,

  constraint company_profiles_venture_unique
    unique (venture_id),

  -- 严格规则：一个 Workspace 永远只有一条 Company Profile
  -- （即使旧 Profile 已 archived 也不能新建）。
  -- 若将来放宽为"同一时间只有一个 active"，
  -- 改为部分唯一索引：
  --   create unique index company_profiles_one_active_per_workspace
  --     on company_profiles (workspace_id) where status = 'active';
  constraint company_profiles_workspace_unique
    unique (workspace_id),

  constraint company_profiles_name_not_blank
    check (length(trim(name)) > 0)
);

-- Section 3
-- =========================================================
-- 1. PROGRAMS
--
-- 定义一个完整产品或课程。
-- 例如：AI Catalyst Founder Toolkit
-- =========================================================

create table programs (
  id uuid primary key default gen_random_uuid(),

  program_key text not null,
  name text not null,
  description text,

  status text not null default 'active'
    check (
      status in (
        'active',
        'archived'
      )
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint programs_program_key_unique
    unique (program_key),

  constraint programs_program_key_not_blank
    check (length(trim(program_key)) > 0),

  constraint programs_name_not_blank
    check (length(trim(name)) > 0)
);


-- =========================================================
-- 2. PROGRAM VERSIONS
--
-- 定义 Program 的具体版本。
--
-- 例如：
-- AI Catalyst Toolkit V2
-- AI Catalyst Toolkit V3
--
-- Founder 开始一个 Journey 后绑定某个固定版本，
-- 后续发布新版本不会影响已经开始的用户。
-- =========================================================

create table program_versions (
  id uuid primary key default gen_random_uuid(),

  program_id uuid not null
    references programs(id) on delete cascade,

  version_number integer not null
    check (version_number > 0),

  version_label text not null,

  name text not null,
  description text,
  release_notes text,

  status text not null default 'draft'
    check (
      status in (
        'draft',
        'published',
        'retired'
      )
    ),

  created_by_user_id uuid
    references users(id),

  published_by_user_id uuid
    references users(id),

  published_at timestamptz,
  retired_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint program_versions_number_unique
    unique (program_id, version_number),

  constraint program_versions_label_unique
    unique (program_id, version_label),

  constraint program_versions_label_not_blank
    check (length(trim(version_label)) > 0),

  constraint program_versions_name_not_blank
    check (length(trim(name)) > 0)
);

-- =========================================================
-- 3. MODULE DEFINITIONS
--
-- 定义 Program Version 中的 Module。
--
-- 这里只保存 Module 的固定配置，
-- 不保存 Founder 的完成状态。
-- =========================================================

create table module_definitions (
  id uuid primary key default gen_random_uuid(),

  program_version_id uuid not null
    references program_versions(id) on delete cascade,

  module_key text not null,

  sequence_index integer not null
    check (sequence_index >= 0),

  title text not null,
  subtitle text,
  description text,

  -- 这个 Module 要帮助 Founder 达成什么目标
  objective text,

  module_type text not null default 'standard'
    check (
      module_type in (
        'setup',
        'standard',
        'review',
        'completion'
      )
    ),

  -- 是否必须完成
  is_required boolean not null default true,

  -- 是否允许在完成后创建 Revision
  allow_revisions boolean not null default true,

  -- 完成方式
  completion_mode text not null default 'artifact_and_confirmation'
    check (
      completion_mode in (
        'artifact',
        'confirmation',
        'artifact_and_confirmation',
        'system'
      )
    ),

  estimated_minutes integer
    check (
      estimated_minutes is null
      or estimated_minutes > 0
    ),

  status text not null default 'active'
    check (
      status in (
        'draft',
        'active',
        'archived'
      )
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint module_definitions_key_unique
    unique (program_version_id, module_key),

  constraint module_definitions_sequence_unique
    unique (program_version_id, sequence_index),

  -- 供 program_run_modules 组合外键使用，
  -- 保证 Module Definition 属于对应 Program Version
  constraint module_definitions_id_version_unique
    unique (id, program_version_id),

  constraint module_definitions_key_not_blank
    check (length(trim(module_key)) > 0),

  constraint module_definitions_title_not_blank
    check (length(trim(title)) > 0)
);

-- =========================================================
-- 4. ARTIFACT DEFINITIONS
--
-- 定义一个 Module 要生成什么成果。
--
-- 一个 Module 可以要求多个 Artifact。
--
-- 例如：
-- Pressure-Test Verdict.md
-- Landing Page.html
-- Investor Deck.pptx
-- =========================================================

create table artifact_definitions (
  id uuid primary key default gen_random_uuid(),

  module_definition_id uuid not null
    references module_definitions(id) on delete cascade,

  artifact_key text not null,

  sequence_index integer not null default 1
    check (sequence_index > 0),

  name text not null,
  description text,

  is_required boolean not null default true,

  -- 成果的业务类型
  artifact_type text not null
    check (
      artifact_type in (
        'document',
        'presentation',
        'web',
        'data',
        'file'
      )
    ),

  -- AI 生成或系统编辑时使用的源格式
  source_format text,

  -- 用户最终下载或使用的格式
  output_format text not null,

  required_filename text,

  -- 文本可为空；PPT、DOCX 等可以指定 Renderer
  renderer_key text,

  -- 网站正式验证使用
  validator_key text,

  allowed_mime_types text[] not null default '{}',

  max_file_size_bytes bigint
    check (
      max_file_size_bytes is null
      or max_file_size_bytes > 0
    ),

  max_files integer not null default 1
    check (max_files > 0),

  -- 必填章节、内容结构等验证配置
  validation_config jsonb not null default '{}'::jsonb,

  -- Renderer、模板、页面尺寸等输出配置
  output_config jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint artifact_definitions_key_unique
    unique (module_definition_id, artifact_key),

  constraint artifact_definitions_sequence_unique
    unique (module_definition_id, sequence_index),

  -- 供 artifact_submissions 组合外键闭环使用
  constraint artifact_definitions_id_module_unique
    unique (id, module_definition_id),

  constraint artifact_definitions_key_not_blank
    check (length(trim(artifact_key)) > 0),

  constraint artifact_definitions_name_not_blank
    check (length(trim(name)) > 0),

  constraint artifact_definitions_output_format_not_blank
    check (length(trim(output_format)) > 0)
);

-- section 4


-- =========================================================
-- PROGRAM RUNS
--
-- 某个 Venture 运行一次 Toolkit。
--
-- 一个 Program Run 可以有多个 Branch，
-- 但 active_branch_id 只指向一个当前可操作 Branch。
-- =========================================================

create table program_runs (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null,
  venture_id uuid not null,

  -- 创建 Run 时只允许绑定 published 的 Program Version（后端验证）
  program_version_id uuid not null
    references program_versions(id),

  -- 当前唯一可操作分支
  -- FK 在文末「后置外键」统一添加。
  -- 切换事务必须验证：目标 Branch status = open、
  -- Run 状态允许切换（后端保证）
  active_branch_id uuid,

  run_number integer not null default 1
    check (run_number > 0),

  name text,

  status text not null default 'draft'
    check (
      status in (
        'draft',
        'active',
        'paused',
        'completed',
        'archived'
      )
    ),

  started_by_user_id uuid
    references users(id),

  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint program_runs_venture_workspace_fk
    foreign key (
      venture_id,
      workspace_id
    )
    references ventures (
      id,
      workspace_id
    )
    on delete cascade,

  constraint program_runs_venture_version_number_unique
    unique (
      venture_id,
      program_version_id,
      run_number
    ),

  constraint program_runs_id_workspace_unique
    unique (
      id,
      workspace_id
    ),

  constraint program_runs_id_workspace_version_unique
    unique (
      id,
      workspace_id,
      program_version_id
    )
);


-- =========================================================
-- PROGRAM RUN BRANCHES
--
-- 一个 Program Run 可以拥有多条验证分支。
--
-- 当前是否可以操作，不由 status = active 表示，
-- 而由 program_runs.active_branch_id 决定。
--
-- Branch status 只表示生命周期：
-- open       仍可被切换为 Active Branch
-- completed  已完成，只读
-- archived   已归档，只读
-- =========================================================

create table program_run_branches (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null,

  program_run_id uuid not null,

  branch_number integer not null
    check (branch_number > 0),

  name text not null,

  status text not null default 'open'
    check (
      status in (
        'open',
        'completed',
        'archived'
      )
    ),

  -- 第一条 Branch 为空
  -- 后续 Branch 指向来源 Branch
  parent_branch_id uuid,

  -- 从父 Branch 的哪个 Module 重新开始
  forked_from_run_module_id uuid,

  -- 分叉时父 Branch 该 Module 的正式 Attempt
  forked_from_attempt_id uuid,

  fork_reason text,

  -- Branch 只能由网站、Admin 或系统创建
  created_via text not null default 'website'
    check (
      created_via in (
        'website',
        'admin',
        'system'
      )
    ),

  created_by_user_id uuid not null
    references users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  completed_at timestamptz,
  archived_at timestamptz,

  constraint program_run_branches_run_workspace_fk
    foreign key (
      program_run_id,
      workspace_id
    )
    references program_runs (
      id,
      workspace_id
    )
    on delete cascade,

  constraint program_run_branches_number_unique
    unique (
      program_run_id,
      branch_number
    ),

  constraint program_run_branches_id_run_workspace_unique
    unique (
      id,
      program_run_id,
      workspace_id
    ),

  constraint program_run_branches_name_not_blank
    check (
      length(trim(name)) > 0
    ),

  constraint program_run_branches_not_parent_self
    check (
      parent_branch_id is null
      or parent_branch_id <> id
    ),

  constraint program_run_branches_fork_structure_check
    check (
      (
        branch_number = 1
        and parent_branch_id is null
        and forked_from_run_module_id is null
        and forked_from_attempt_id is null
      )
      or
      (
        branch_number > 1
        and parent_branch_id is not null
        and forked_from_run_module_id is not null
        and forked_from_attempt_id is not null
      )
    )
);


-- =========================================================
-- PROGRAM RUN MODULES
--
-- 某个 Branch 中的 Module 状态。
--
-- 每个 Branch 都有自己独立的 Module 状态。
--
-- inherited：
-- 分叉点之前的 Module，沿用父 Branch 的正式结果。
--
-- 分叉 Module：
-- 从 available / in_progress 重新开始。
--
-- 后续 Module：
-- locked。
-- =========================================================

create table program_run_modules (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null,

  program_run_id uuid not null,
  program_version_id uuid not null,

  program_run_branch_id uuid not null,

  module_definition_id uuid not null,

  -- Module Definition 的运行时快照
  module_key text not null,
  title_snapshot text not null,

  sequence_index integer not null
    check (sequence_index >= 0),

  status text not null default 'locked'
    check (
      status in (
        'locked',
        'inherited',
        'available',
        'in_progress',
        'ready_to_unlock',
        'completed'
      )
    ),

  -- inherited Module 指向父 Branch 对应的正式 Module
  -- 来源属于 Parent Branch 且已 completed：由后端事务保证
  inherited_from_run_module_id uuid,

  -- 当前正在编辑或等待处理的 Attempt
  -- 必须处于 draft / in_progress / submitted / ready_for_review：
  -- 由后端事务保证
  active_attempt_id uuid,

  -- 当前正式生效的 Attempt
  -- 必须指向 accepted 状态的 Attempt：由后端采纳事务保证
  accepted_attempt_id uuid,

  unlocked_at timestamptz,
  started_at timestamptz,
  ready_to_unlock_at timestamptz,

  completed_at timestamptz,

  completed_by_user_id uuid
    references users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint program_run_modules_run_fk
    foreign key (
      program_run_id,
      workspace_id,
      program_version_id
    )
    references program_runs (
      id,
      workspace_id,
      program_version_id
    )
    on delete cascade,

  constraint program_run_modules_branch_fk
    foreign key (
      program_run_branch_id,
      program_run_id,
      workspace_id
    )
    references program_run_branches (
      id,
      program_run_id,
      workspace_id
    )
    on delete cascade,

  constraint program_run_modules_definition_fk
    foreign key (
      module_definition_id,
      program_version_id
    )
    references module_definitions (
      id,
      program_version_id
    ),

  constraint program_run_modules_branch_definition_unique
    unique (
      program_run_branch_id,
      module_definition_id
    ),

  constraint program_run_modules_branch_sequence_unique
    unique (
      program_run_branch_id,
      sequence_index
    ),

  constraint program_run_modules_branch_key_unique
    unique (
      program_run_branch_id,
      module_key
    ),

  constraint program_run_modules_id_workspace_unique
    unique (
      id,
      workspace_id
    ),

  -- 供分叉来源外键使用：Module 属于哪个 Branch
  constraint program_run_modules_id_branch_unique
    unique (
      id,
      program_run_branch_id
    ),

  -- 供 inherited / artifact / workflow 组合外键闭环使用
  constraint program_run_modules_id_definition_unique
    unique (
      id,
      module_definition_id
    ),

  constraint program_run_modules_inherited_check
    check (
      (
        status = 'inherited'
        and inherited_from_run_module_id is not null
      )
      or
      (
        status <> 'inherited'
        and inherited_from_run_module_id is null
      )
    ),

  constraint program_run_modules_not_inherit_self
    check (
      inherited_from_run_module_id is null
      or inherited_from_run_module_id <> id
    )
);


-- =========================================================
-- MODULE ATTEMPTS
--
-- Attempt 只处理当前 Branch 当前 Module 内的工作。
--
-- initial：
-- 当前 Branch 中第一次正式尝试。
--
-- retry：
-- 同一 Branch、同一 Module 验证失败后的重新提交。
--
-- 返回前面 Module 不创建 Revision Attempt，
-- 而是在网站创建新的 Branch。
-- =========================================================

create table module_attempts (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null,

  program_run_module_id uuid not null,

  attempt_number integer not null
    check (attempt_number > 0),

  attempt_type text not null
    check (
      attempt_type in (
        'initial',
        'retry'
      )
    ),

  status text not null default 'draft'
    check (
      status in (
        'draft',
        'in_progress',
        'submitted',
        'validation_failed',
        'ready_for_review',
        'accepted',
        'rejected',
        'cancelled'
      )
    ),

  -- Retry 基于哪个失败的 Attempt
  -- 组合外键保证其属于同一 Module
  based_on_attempt_id uuid,

  started_by_user_id uuid not null
    references users(id),

  started_via text not null
    check (
      started_via in (
        'website',
        'claude',
        'openai',
        'system'
      )
    ),

  submitted_at timestamptz,

  accepted_by_user_id uuid
    references users(id),

  accepted_at timestamptz,

  rejected_by_user_id uuid
    references users(id),

  rejected_at timestamptz,

  -- Reviewer 审核意见（轻量方案：单 Mentor 单结论）
  review_notes text,

  -- status = rejected 时填写
  rejection_reason text,

  cancelled_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint module_attempts_run_module_workspace_fk
    foreign key (
      program_run_module_id,
      workspace_id
    )
    references program_run_modules (
      id,
      workspace_id
    )
    on delete cascade,

  constraint module_attempts_number_unique
    unique (
      program_run_module_id,
      attempt_number
    ),

  constraint module_attempts_id_workspace_unique
    unique (
      id,
      workspace_id
    ),

  -- 供 program_run_modules.active/accepted_attempt_id
  -- 组合外键使用，保证 Attempt 属于该 Module
  constraint module_attempts_id_run_module_unique
    unique (
      id,
      program_run_module_id
    ),

  constraint module_attempts_based_on_same_module_fk
    foreign key (
      based_on_attempt_id,
      program_run_module_id
    )
    references module_attempts (
      id,
      program_run_module_id
    ),

  constraint module_attempts_type_check
    check (
      (
        attempt_number = 1
        and attempt_type = 'initial'
        and based_on_attempt_id is null
      )
      or
      (
        attempt_number > 1
        and attempt_type = 'retry'
        and based_on_attempt_id is not null
      )
    ),

  constraint module_attempts_not_based_on_self
    check (
      based_on_attempt_id is null
      or based_on_attempt_id <> id
    )
);

-- 同一 Module 同时最多一个进行中的 Attempt
create unique index module_attempts_one_active_unique
  on module_attempts (program_run_module_id)
  where status in ('draft', 'in_progress', 'submitted', 'ready_for_review');

-- 同一 Module 最多一个 accepted Attempt
create unique index module_attempts_one_accepted_unique
  on module_attempts (program_run_module_id)
  where status = 'accepted';


-- =========================================================
-- MODULE RESPONSES
--
-- 保存某次 Attempt 中 Founder 的结构化背景回答。
--
-- 用于：
-- Claude / OpenAI 跨会话继续工作
-- Reviewer 查看结论背后的上下文
-- 新 Branch 参考旧 Branch 的历史结果
-- 区分事实、证据、假设和未确认内容
--
-- Attempt 提交后，Responses 应冻结。
-- 验证失败后通过新的 Retry Attempt 继续。
-- =========================================================

create table module_responses (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null,

  module_attempt_id uuid not null,

  question_key text not null,

  sequence_index integer not null
    check (sequence_index >= 0),

  -- 保存当时实际使用的问题文本
  question_text_snapshot text not null,

  response_type text not null
    check (
      response_type in (
        'short_text',
        'long_text',
        'single_choice',
        'multi_choice',
        'boolean',
        'number',
        'date',
        'url',
        'structured'
      )
    ),

  response_status text not null default 'answered'
    check (
      response_status in (
        'answered',
        'skipped',
        'not_applicable',
        'needs_follow_up'
      )
    ),

  -- 人类可读的原始回答
  answer_text text,

  -- AI 和系统使用的结构化回答
  -- 可以是 object、array、string、number 等 JSON
  answer_data jsonb,

  -- Review 页面使用的简短摘要
  answer_summary text,

  claim_status text
    check (
      claim_status is null
      or claim_status in (
        'unknown',
        'assumption',
        'hypothesis',
        'partially_supported',
        'supported',
        'validated',
        'not_applicable'
      )
    ),

  -- URL、文件、访谈记录、其他 Artifact 引用
  evidence_refs jsonb not null default '[]'::jsonb,

  -- 例如：
  -- key_assumption
  -- missing_evidence
  -- founder_decision
  -- review_priority
  review_tags text[] not null default '{}',

  source_provider text not null
    check (
      source_provider in (
        'website',
        'claude',
        'openai'
      )
    ),

  captured_via text not null default 'direct_response'
    check (
      captured_via in (
        'direct_response',
        'ai_extraction',
        'website_edit',
        'import'
      )
    ),

  provided_by_user_id uuid not null
    references users(id),

  answered_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint module_responses_attempt_workspace_fk
    foreign key (
      module_attempt_id,
      workspace_id
    )
    references module_attempts (
      id,
      workspace_id
    )
    on delete cascade,

  constraint module_responses_question_unique
    unique (
      module_attempt_id,
      question_key
    ),

  constraint module_responses_question_key_not_blank
    check (
      length(trim(question_key)) > 0
    ),

  constraint module_responses_question_text_not_blank
    check (
      length(trim(question_text_snapshot)) > 0
    ),

  constraint module_responses_answer_required
    check (
      response_status <> 'answered'
      or answer_text is not null
      or answer_data is not null
    )
);


-- =========================================================
-- MODULE REVIEW CONTEXT SNAPSHOTS
--
-- Attempt 提交时生成冻结的 Review 背景。
--
-- Reviewer 审核 Artifact 时，
-- 必须读取与该 Artifact 相同 Attempt 的 Context。
--
-- 每个 Attempt 一份正式 Snapshot。
-- =========================================================

create table module_review_context_snapshots (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null,

  module_attempt_id uuid not null,

  context_summary text,

  key_facts jsonb not null default '[]'::jsonb,

  key_assumptions jsonb not null default '[]'::jsonb,

  evidence_summary jsonb not null default '[]'::jsonb,

  key_decisions jsonb not null default '[]'::jsonb,

  unresolved_questions jsonb not null default '[]'::jsonb,

  -- 提交时全部结构化回答的冻结副本
  response_snapshot jsonb not null default '[]'::jsonb,

  generated_by text not null default 'system'
    check (
      generated_by in (
        'system',
        'claude',
        'openai',
        'admin'
      )
    ),

  generated_by_user_id uuid
    references users(id),

  generated_at timestamptz not null default now(),

  created_at timestamptz not null default now(),

  constraint module_review_context_attempt_workspace_fk
    foreign key (
      module_attempt_id,
      workspace_id
    )
    references module_attempts (
      id,
      workspace_id
    )
    on delete cascade,

  constraint module_review_context_attempt_unique
    unique (
      module_attempt_id
    )
);


-- =========================================================
-- PROGRAM RUN EVENTS
--
-- 记录 Program Run 和 Branch 的关键操作。
--
-- Branch 创建、切换、归档均属于网站业务操作。
-- =========================================================

create table program_run_events (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null,

  program_run_id uuid not null,

  -- 三个 Branch 均通过组合外键保证属于本 Run（见表末约束）
  branch_id uuid,

  from_branch_id uuid,

  to_branch_id uuid,

  event_type text not null
    check (
      event_type in (
        'run_created',
        'run_started',
        'run_paused',
        'run_resumed',
        'branch_created',
        'branch_switched',
        'branch_completed',
        'branch_archived',
        'run_completed',
        'run_archived'
      )
    ),

  actor_type text not null
    check (
      actor_type in (
        'user',
        'admin',
        'system'
      )
    ),

  actor_user_id uuid
    references users(id),

  source text not null default 'website'
    check (
      source in (
        'website',
        'admin',
        'system'
      )
    ),

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  constraint program_run_events_run_workspace_fk
    foreign key (
      program_run_id,
      workspace_id
    )
    references program_runs (
      id,
      workspace_id
    )
    on delete cascade,

  constraint program_run_events_branch_fk
    foreign key (branch_id, program_run_id, workspace_id)
    references program_run_branches (id, program_run_id, workspace_id),

  constraint program_run_events_from_branch_fk
    foreign key (from_branch_id, program_run_id, workspace_id)
    references program_run_branches (id, program_run_id, workspace_id),

  constraint program_run_events_to_branch_fk
    foreign key (to_branch_id, program_run_id, workspace_id)
    references program_run_branches (id, program_run_id, workspace_id)
);

-- =========================================================
-- MODULE EVENTS
--
-- 保存 Module、Attempt、Response、Artifact 和验证事件。
--
-- 不保存完整 AI 对话。
-- =========================================================

create table module_events (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null,

  program_run_id uuid not null,

  program_run_branch_id uuid not null,

  program_run_module_id uuid not null,

  -- 组合外键保证 Attempt 属于本 Module（见表末约束）
  module_attempt_id uuid,

  event_type text not null
    check (
      event_type in (
        'module_inherited',
        'module_unlocked',
        'module_started',
        'attempt_started',
        'response_saved',
        'draft_saved',
        'artifact_uploaded',
        'attempt_submitted',
        'validation_started',
        'validation_failed',
        'validation_passed',
        'attempt_accepted',
        'attempt_rejected',
        'attempt_cancelled',
        'retry_started',
        'ready_to_unlock',
        'module_completed'
      )
    ),

  actor_type text not null
    check (
      actor_type in (
        'user',
        'mcp',
        'system',
        'validator',
        'admin'
      )
    ),

  actor_user_id uuid
    references users(id),

  source_provider text
    check (
      source_provider is null
      or source_provider in (
        'website',
        'claude',
        'openai',
        'system'
      )
    ),

  from_status text,
  to_status text,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  constraint module_events_run_workspace_fk
    foreign key (
      program_run_id,
      workspace_id
    )
    references program_runs (
      id,
      workspace_id
    )
    on delete cascade,

  constraint module_events_branch_run_workspace_fk
    foreign key (
      program_run_branch_id,
      program_run_id,
      workspace_id
    )
    references program_run_branches (
      id,
      program_run_id,
      workspace_id
    )
    on delete cascade,

  constraint module_events_module_workspace_fk
    foreign key (
      program_run_module_id,
      workspace_id
    )
    references program_run_modules (
      id,
      workspace_id
    )
    on delete cascade,

  -- Module 必须属于本 Branch
  constraint module_events_module_branch_fk
    foreign key (program_run_module_id, program_run_branch_id)
    references program_run_modules (id, program_run_branch_id),

  -- Attempt 必须属于本 Module
  constraint module_events_attempt_module_fk
    foreign key (module_attempt_id, program_run_module_id)
    references module_attempts (id, program_run_module_id)
);


-- section 5


-- =========================================================
-- STORAGE OBJECTS
--
-- 保存文件存储元数据。
--
-- storage_provider 支持 local / s3：
-- Dev 与测试使用 local，生产使用 s3，
-- 表结构不变，只切换 provider 配置。
--
-- 不保存永久 Public URL。
-- 使用 storage_provider + storage_container + object_key 定位。
--
-- 文件上传前可以先创建 pending 记录，
-- 上传完成后由后端验证并改为 verified。
-- local 环境的 checksum_sha256 由后端写盘时计算填入。
--
-- 归属规则：
-- Workspace 内产物 → workspace_id 必填
-- 个人文件（如头像）→ owner_user_id 必填，workspace_id 可空
-- =========================================================

create table storage_objects (
  id uuid primary key default gen_random_uuid(),

  -- Workspace 内产物必填；个人文件可为空
  workspace_id uuid
    references workspaces(id) on delete cascade,

  -- 个人文件（头像等）的归属用户
  owner_user_id uuid
    references users(id),

  storage_provider text not null default 'local'
    check (
      storage_provider in (
        'local',
        's3'
      )
    ),

  -- 环境或存储配置标识
  --
  -- local:
  --   local-development
  --
  -- s3:
  --   ai-catalyst-dev
  --   ai-catalyst-production
  storage_container text not null,

  -- 两种 Provider 都使用统一的逻辑对象路径
  --
  -- 例如：
  -- users/{user_id}/avatar/{storage_object_id}.png
  -- workspaces/{workspace_id}/
  -- program-runs/{run_id}/
  -- branches/{branch_id}/
  -- modules/{module_key}/
  -- attempts/{attempt_id}/
  -- submissions/{submission_id}/
  -- files/{storage_object_id}.pptx
  object_key text not null,

  -- S3 Versioning 返回的 Version ID
  -- local 环境为空
  object_version_id text,

  original_filename text not null,
  content_type text not null,

  file_extension text,

  size_bytes bigint
    check (
      size_bytes is null
      or size_bytes >= 0
    ),

  checksum_sha256 text,
  etag text,

  upload_status text not null default 'pending'
    check (
      upload_status in (
        'pending',
        'uploaded',
        'verified',
        'failed',
        'deleted'
      )
    ),

  created_via text not null
    check (
      created_via in (
        'website',
        'claude',
        'openai',
        'renderer',
        'system',
        'import'
      )
    ),

  uploaded_by_user_id uuid
    references users(id),

  uploaded_at timestamptz,
  verified_at timestamptz,
  deleted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint storage_objects_owner_check
    check (
      workspace_id is not null
      or owner_user_id is not null
    ),

  constraint storage_objects_location_unique
    unique (
      storage_provider,
      storage_container,
      object_key
    ),

  constraint storage_objects_id_workspace_unique
    unique (
      id,
      workspace_id
    ),

  -- 供头像等个人文件的租户安全外键使用
  constraint storage_objects_id_owner_unique
    unique (
      id,
      owner_user_id
    ),

  constraint storage_objects_container_not_blank
    check (
      length(trim(storage_container)) > 0
    ),

  constraint storage_objects_object_key_not_blank
    check (
      length(trim(object_key)) > 0
    ),

  constraint storage_objects_filename_not_blank
    check (
      length(trim(original_filename)) > 0
    ),

  constraint storage_objects_content_type_not_blank
    check (
      length(trim(content_type)) > 0
    ),

  constraint storage_objects_version_check
    check (
      storage_provider = 's3'
      or object_version_id is null
    )
);


-- =========================================================
-- ARTIFACT SUBMISSIONS
--
-- 一个 Module Attempt 中，
-- 某个 Artifact Definition 的一个版本。
--
-- 例如：
-- v1 Claude 生成
-- v2 Founder 下载后本地修改并上传
-- v3 OpenAI 根据验证结果重新生成
--
-- 不覆盖旧版本；新版本产生后旧版本置为 superseded。
--
-- status 只表达版本生命周期：
-- 验证结果在 artifact_validations，
-- 是否被采纳跟随 module_attempts。
-- =========================================================

create table artifact_submissions (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null,

  module_attempt_id uuid not null,

  -- 冗余列：组合外键闭环，
  -- 保证 Artifact Definition 属于该 Attempt 所在 Module
  program_run_module_id uuid not null,
  module_definition_id uuid not null,

  artifact_definition_id uuid not null,

  version_number integer not null
    check (version_number > 0),

  status text not null default 'draft'
    check (
      status in (
        'draft',
        'submitted',
        'superseded',
        'deleted'
      )
    ),

  created_via text not null
    check (
      created_via in (
        'website',
        'claude',
        'openai',
        'renderer',
        'system',
        'import'
      )
    ),

  created_by_user_id uuid
    references users(id),

  notes text,

  submitted_at timestamptz,
  superseded_at timestamptz,
  deleted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint artifact_submissions_attempt_workspace_fk
    foreign key (
      module_attempt_id,
      workspace_id
    )
    references module_attempts (
      id,
      workspace_id
    )
    on delete cascade,

  -- 闭环链 1：Attempt → Run Module
  constraint artifact_submissions_attempt_module_fk
    foreign key (
      module_attempt_id,
      program_run_module_id
    )
    references module_attempts (
      id,
      program_run_module_id
    ),

  -- 闭环链 2：Run Module → Module Definition
  constraint artifact_submissions_run_module_definition_fk
    foreign key (
      program_run_module_id,
      module_definition_id
    )
    references program_run_modules (
      id,
      module_definition_id
    ),

  -- 闭环链 3：Artifact Definition → 同一 Module Definition
  constraint artifact_submissions_definition_module_fk
    foreign key (
      artifact_definition_id,
      module_definition_id
    )
    references artifact_definitions (
      id,
      module_definition_id
    ),

  constraint artifact_submissions_version_unique
    unique (
      module_attempt_id,
      artifact_definition_id,
      version_number
    ),

  constraint artifact_submissions_id_workspace_unique
    unique (
      id,
      workspace_id
    )
);


-- =========================================================
-- ARTIFACT RENDER JOBS
--
-- 用于服务端生成二进制或预览文件。
--
-- 例如：
-- presentation JSON → PPTX
-- Markdown → DOCX
-- PPTX → PDF Preview
-- HTML → Screenshot
--
-- Renderer 生成的文件仍然写入 storage_objects，
-- 并通过 artifact_files 关联到 Submission。
-- =========================================================

create table artifact_render_jobs (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null,

  artifact_submission_id uuid not null,

  -- 作为 Renderer 输入的源文件
  -- 例如 presentation.json
  input_storage_object_id uuid,

  renderer_key text not null,
  renderer_version text not null,

  output_format text not null,

  status text not null default 'queued'
    check (
      status in (
        'queued',
        'running',
        'succeeded',
        'failed',
        'cancelled'
      )
    ),

  requested_via text not null
    check (
      requested_via in (
        'website',
        'claude',
        'openai',
        'system'
      )
    ),

  requested_by_user_id uuid
    references users(id),

  -- 提交时冻结 Renderer 配置
  render_config_snapshot jsonb not null default '{}'::jsonb,

  attempt_count integer not null default 0
    check (attempt_count >= 0),

  result_metadata jsonb not null default '{}'::jsonb,

  error_code text,
  error_message text,
  error_details jsonb not null default '{}'::jsonb,

  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint artifact_render_jobs_submission_workspace_fk
    foreign key (
      artifact_submission_id,
      workspace_id
    )
    references artifact_submissions (
      id,
      workspace_id
    )
    on delete cascade,

  -- input 文件必须属于本 Submission：
  -- 组合外键在文末「后置外键」段（与 artifact_files 循环依赖）

  constraint artifact_render_jobs_id_workspace_unique
    unique (
      id,
      workspace_id
    ),

  constraint artifact_render_jobs_id_submission_unique
    unique (
      id,
      artifact_submission_id
    ),

  constraint artifact_render_jobs_renderer_key_not_blank
    check (
      length(trim(renderer_key)) > 0
    ),

  constraint artifact_render_jobs_renderer_version_not_blank
    check (
      length(trim(renderer_version)) > 0
    ),

  constraint artifact_render_jobs_output_format_not_blank
    check (
      length(trim(output_format)) > 0
    )
);


-- =========================================================
-- ARTIFACT FILES
--
-- 将一个 Artifact Submission 与实际 Storage Object 连接。
--
-- 一个 Submission 可以有多个文件。
--
-- PPT 示例：
-- source     deck.presentation.json
-- rendered   investor-deck.pptx
-- preview    investor-deck.pdf
-- thumbnail  slide-01.png
--
-- HTML 示例：
-- source     index.html
-- asset      styles.css
-- asset      hero.png
-- package    landing-page.zip
-- =========================================================

create table artifact_files (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null,

  artifact_submission_id uuid not null,

  storage_object_id uuid not null,

  -- Renderer 生成的文件可关联对应 Job
  render_job_id uuid,

  file_role text not null
    check (
      file_role in (
        'source',
        'rendered',
        'preview',
        'thumbnail',
        'asset',
        'package',
        'attachment'
      )
    ),

  format text not null,

  display_name text,

  sequence_index integer not null default 1
    check (sequence_index > 0),

  is_primary boolean not null default false,

  downloadable boolean not null default true,

  created_at timestamptz not null default now(),

  constraint artifact_files_submission_workspace_fk
    foreign key (
      artifact_submission_id,
      workspace_id
    )
    references artifact_submissions (
      id,
      workspace_id
    )
    on delete cascade,

  constraint artifact_files_storage_workspace_fk
    foreign key (
      storage_object_id,
      workspace_id
    )
    references storage_objects (
      id,
      workspace_id
    ),

  -- Render Job 必须属于同一 Submission
  constraint artifact_files_render_job_fk
    foreign key (
      render_job_id,
      artifact_submission_id
    )
    references artifact_render_jobs (
      id,
      artifact_submission_id
    ),

  constraint artifact_files_submission_storage_unique
    unique (
      artifact_submission_id,
      storage_object_id
    ),

  constraint artifact_files_id_workspace_unique
    unique (
      id,
      workspace_id
    ),

  constraint artifact_files_id_submission_unique
    unique (
      id,
      artifact_submission_id
    ),

  constraint artifact_files_format_not_blank
    check (
      length(trim(format)) > 0
    )
);


-- =========================================================
-- ARTIFACT VALIDATIONS
--
-- 保存 Artifact 的检查和正式验证结果。
--
-- draft_check：
-- MCP 或网站执行的草稿预检查。
-- 不可以完成 Module 或解锁下一步。
--
-- official：
-- 网站后端执行的正式验证。
-- 只有 official passed 才能进入 ready_for_review。
-- =========================================================

create table artifact_validations (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null,

  artifact_submission_id uuid not null,

  -- 可选：只验证 Submission 中的某个具体文件
  target_artifact_file_id uuid,

  validation_number integer not null
    check (validation_number > 0),

  validation_kind text not null
    check (
      validation_kind in (
        'draft_check',
        'official'
      )
    ),

  status text not null default 'pending'
    check (
      status in (
        'pending',
        'running',
        'passed',
        'failed',
        'error',
        'cancelled'
      )
    ),

  validator_key text not null,
  validator_version text not null,

  triggered_via text not null
    check (
      triggered_via in (
        'website',
        'mcp',
        'system',
        'admin'
      )
    ),

  triggered_by_user_id uuid
    references users(id),

  -- 验证时实际使用的规则快照
  rule_snapshot jsonb not null default '{}'::jsonb,

  -- 每项检查的结构化结果
  checks jsonb not null default '[]'::jsonb,

  -- 阻止通过的问题
  issues jsonb not null default '[]'::jsonb,

  -- 不阻止通过，但建议用户处理的问题
  warnings jsonb not null default '[]'::jsonb,

  summary text,

  score numeric(5,2)
    check (
      score is null
      or score between 0 and 100
    ),

  error_code text,
  error_message text,

  started_at timestamptz,
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint artifact_validations_submission_workspace_fk
    foreign key (
      artifact_submission_id,
      workspace_id
    )
    references artifact_submissions (
      id,
      workspace_id
    )
    on delete cascade,

  -- 被验证文件必须属于本 Submission
  constraint artifact_validations_target_file_fk
    foreign key (
      target_artifact_file_id,
      artifact_submission_id
    )
    references artifact_files (
      id,
      artifact_submission_id
    ),

  constraint artifact_validations_number_unique
    unique (
      artifact_submission_id,
      validation_number
    ),

  constraint artifact_validations_id_workspace_unique
    unique (
      id,
      workspace_id
    ),

  -- 正式验证只能由网站后端 / 系统 / Admin 触发，
  -- 与产品安全边界一致（MCP 只能做 draft_check）
  constraint artifact_validations_official_authority_check
    check (
      validation_kind <> 'official'
      or triggered_via in (
        'website',
        'system',
        'admin'
      )
    ),

  constraint artifact_validations_validator_key_not_blank
    check (
      length(trim(validator_key)) > 0
    ),

  constraint artifact_validations_validator_version_not_blank
    check (
      length(trim(validator_version)) > 0
    )
);


-- =========================================================
-- PROMPT DEFINITIONS
--
-- 定义 Prompt 的身份和用途，不保存具体内容。
-- 具体内容存入 prompt_versions。
-- =========================================================

create table prompt_definitions (
  id uuid primary key default gen_random_uuid(),

  prompt_key text not null,
  name text not null,
  description text,

  prompt_type text not null
    check (
      prompt_type in (
        'global_instruction',
        'platform_boundary',
        'module_facilitator',
        'artifact_generator',
        'retry_guide',
        'review_context_generator',
        'validation_feedback_guide'
      )
    ),

  status text not null default 'active'
    check (
      status in (
        'active',
        'archived'
      )
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint prompt_definitions_key_unique
    unique (prompt_key),

  constraint prompt_definitions_key_not_blank
    check (length(trim(prompt_key)) > 0),

  constraint prompt_definitions_name_not_blank
    check (length(trim(name)) > 0)
);


-- =========================================================
-- PROMPT VERSIONS
--
-- 保存 Prompt 的具体版本内容。
--
-- Program Version 和 Module Definition 绑定具体的
-- prompt_version_id，避免 Prompt 更新影响历史 Journey。
-- =========================================================

create table prompt_versions (
  id uuid primary key default gen_random_uuid(),

  prompt_definition_id uuid not null
    references prompt_definitions(id) on delete cascade,

  version_number integer not null
    check (version_number > 0),

  content text not null,

  content_format text not null default 'markdown'
    check (
      content_format in (
        'plain_text',
        'markdown',
        'json'
      )
    ),

  -- Prompt 支持的变量说明
  --
  -- 例如：
  -- {
  --   "variables": [
  --     "venture_name",
  --     "module_title",
  --     "founder_context"
  --   ]
  -- }
  variable_config jsonb not null default '{}'::jsonb,

  status text not null default 'draft'
    check (
      status in (
        'draft',
        'published',
        'retired'
      )
    ),

  created_by_user_id uuid
    references users(id),

  published_by_user_id uuid
    references users(id),

  published_at timestamptz,
  retired_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint prompt_versions_number_unique
    unique (
      prompt_definition_id,
      version_number
    ),

  constraint prompt_versions_content_not_blank
    check (
      length(trim(content)) > 0
    )
);


-- =========================================================
-- PROGRAM PROMPT BINDINGS
--
-- 将 Program Version 与全局 Prompt 绑定。
--
-- 例如：
-- Toolkit V2
-- ├── Global Assistant Instruction v3
-- └── Platform Boundary v2
-- =========================================================

create table program_prompt_bindings (
  id uuid primary key default gen_random_uuid(),

  program_version_id uuid not null
    references program_versions(id) on delete cascade,

  prompt_version_id uuid not null
    references prompt_versions(id),

  purpose text not null
    check (
      purpose in (
        'global_assistant',
        'platform_boundary',
        'provider_guidance'
      )
    ),

  sequence_index integer not null default 1
    check (sequence_index > 0),

  is_required boolean not null default true,

  created_at timestamptz not null default now(),

  constraint program_prompt_bindings_unique
    unique (
      program_version_id,
      purpose,
      sequence_index
    )
);


-- =========================================================
-- MODULE PROMPT BINDINGS
--
-- 将 Module Definition 与具体 Prompt Version 绑定。
--
-- 一个 Module 可以绑定多个不同用途的 Prompt。
-- =========================================================

create table module_prompt_bindings (
  id uuid primary key default gen_random_uuid(),

  module_definition_id uuid not null
    references module_definitions(id) on delete cascade,

  prompt_version_id uuid not null
    references prompt_versions(id),

  purpose text not null
    check (
      purpose in (
        'facilitator',
        'artifact_generator',
        'retry_guide',
        'review_context_generator',
        'validation_feedback_guide'
      )
    ),

  sequence_index integer not null default 1
    check (sequence_index > 0),

  is_required boolean not null default true,

  created_at timestamptz not null default now(),

  constraint module_prompt_bindings_unique
    unique (
      module_definition_id,
      purpose,
      sequence_index
    )
);


-- =========================================================
-- MODULE QUESTIONS
--
-- 定义每个 Module 需要向 Founder 收集的问题。
--
-- 实际回答保存到 module_responses。
-- module_responses 会保存 question_text_snapshot，
-- 因此后续修改问题不会影响历史回答。
-- =========================================================

create table module_questions (
  id uuid primary key default gen_random_uuid(),

  module_definition_id uuid not null
    references module_definitions(id) on delete cascade,

  question_key text not null,

  sequence_index integer not null
    check (sequence_index >= 0),

  question_group text,

  question_text text not null,
  help_text text,
  placeholder_text text,

  response_type text not null
    check (
      response_type in (
        'short_text',
        'long_text',
        'single_choice',
        'multi_choice',
        'boolean',
        'number',
        'date',
        'url',
        'structured'
      )
    ),

  is_required boolean not null default true,
  allow_skip boolean not null default false,

  -- 单选、多选的选项
  --
  -- [
  --   {
  --     "value": "b2b",
  --     "label": "B2B"
  --   }
  -- ]
  options jsonb not null default '[]'::jsonb,

  -- 条件显示规则
  --
  -- {
  --   "depends_on": "has_customers",
  --   "operator": "equals",
  --   "value": true
  -- }
  conditions jsonb not null default '{}'::jsonb,

  -- 期望保存的结构化回答格式
  response_schema jsonb not null default '{}'::jsonb,

  -- Reviewer 页面如何展示和强调该回答
  review_config jsonb not null default '{}'::jsonb,

  default_review_tags text[] not null default '{}',

  status text not null default 'active'
    check (
      status in (
        'active',
        'archived'
      )
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint module_questions_key_unique
    unique (
      module_definition_id,
      question_key
    ),

  constraint module_questions_sequence_unique
    unique (
      module_definition_id,
      sequence_index
    ),

  constraint module_questions_key_not_blank
    check (
      length(trim(question_key)) > 0
    ),

  constraint module_questions_text_not_blank
    check (
      length(trim(question_text)) > 0
    )
);


-- =========================================================
-- WORKFLOW DEFINITIONS
--
-- 定义一个 Module 应该按照什么流程运行。
--
-- Module Definition 属于固定 Program Version，
-- Workflow 自身仍保留版本，方便修改和测试。
--
-- 范围：Workflow 只覆盖 Module 执行流程
-- （最远到 attempt_submitted / 正式验证）；
-- Review 与采纳生命周期由 module_attempts.status 管理。
--
-- Attempt 创建时通过 module_workflow_states 冻结所用版本，
-- 运行中不自动切换到最新 published 版本。
-- =========================================================

create table workflow_definitions (
  id uuid primary key default gen_random_uuid(),

  module_definition_id uuid not null
    references module_definitions(id) on delete cascade,

  workflow_key text not null,

  version_number integer not null
    check (version_number > 0),

  name text not null,
  description text,

  -- 入口 Step；published 前必须设置。
  -- 组合外键在文末「后置外键」段（deferrable）
  entry_step_key text,

  status text not null default 'draft'
    check (
      status in (
        'draft',
        'published',
        'retired'
      )
    ),

  created_by_user_id uuid
    references users(id),

  published_by_user_id uuid
    references users(id),

  published_at timestamptz,
  retired_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint workflow_definitions_version_unique
    unique (
      module_definition_id,
      workflow_key,
      version_number
    ),

  -- 供 module_workflow_states 组合外键闭环使用
  constraint workflow_definitions_id_module_unique
    unique (
      id,
      module_definition_id
    ),

  constraint workflow_definitions_published_entry_check
    check (
      status <> 'published'
      or entry_step_key is not null
    ),

  constraint workflow_definitions_key_not_blank
    check (
      length(trim(workflow_key)) > 0
    ),

  constraint workflow_definitions_name_not_blank
    check (
      length(trim(name)) > 0
    )
);


-- =========================================================
-- WORKFLOW STEPS
--
-- 定义 Workflow 中的具体步骤。
--
-- Prompt 告诉 AI 如何执行，
-- Workflow Step 决定系统允许执行什么动作。
--
-- 流转约定：
-- sequence_index 仅用于展示排序；
-- 实际流转一律以 next_step_key / failure_step_key 为准。
-- =========================================================

create table workflow_steps (
  id uuid primary key default gen_random_uuid(),

  workflow_definition_id uuid not null
    references workflow_definitions(id) on delete cascade,

  step_key text not null,

  sequence_index integer not null
    check (sequence_index >= 0),

  name text not null,
  description text,

  actor text not null
    check (
      actor in (
        'website',
        'user',
        'ai',
        'mcp',
        'system',
        'validator'
      )
    ),

  action_type text not null
    check (
      action_type in (
        'load_context',
        'show_instruction',
        'ask_question',
        'save_response',
        'generate_artifact',
        'save_draft',
        'wait_for_upload',
        'run_draft_check',
        'run_official_validation',
        'wait_for_confirmation',
        'complete_module',
        'unlock_next_module',
        'end'
      )
    ),

  -- 该步骤可选绑定特定 Prompt
  prompt_version_id uuid
    references prompt_versions(id),

  -- ask_question 时，可以通过 Config 引用：
  -- question_key 或 question_group
  config jsonb not null default '{}'::jsonb,

  is_optional boolean not null default false,

  requires_user_confirmation boolean not null default false,

  next_step_key text,
  failure_step_key text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint workflow_steps_key_unique
    unique (
      workflow_definition_id,
      step_key
    ),

  constraint workflow_steps_sequence_unique
    unique (
      workflow_definition_id,
      sequence_index
    ),

  constraint workflow_steps_id_workflow_unique
    unique (
      id,
      workflow_definition_id
    ),

  constraint workflow_steps_key_not_blank
    check (
      length(trim(step_key)) > 0
    ),

  constraint workflow_steps_name_not_blank
    check (
      length(trim(name)) > 0
    ),

  -- next / failure 必须指向同一 Workflow 内已存在的 step_key
  -- deferrable：允许同一事务内先插入全部 Step 再校验
  constraint workflow_steps_next_step_fk
    foreign key (
      workflow_definition_id,
      next_step_key
    )
    references workflow_steps (
      workflow_definition_id,
      step_key
    )
    deferrable initially deferred,

  constraint workflow_steps_failure_step_fk
    foreign key (
      workflow_definition_id,
      failure_step_key
    )
    references workflow_steps (
      workflow_definition_id,
      step_key
    )
    deferrable initially deferred,

  -- 正式验证、完成和解锁不能交给 AI 或 MCP
  constraint workflow_steps_authority_check
    check (
      action_type not in (
        'run_official_validation',
        'complete_module',
        'unlock_next_module'
      )
      or actor in (
        'website',
        'system',
        'validator'
      )
    )
);


-- =========================================================
-- MODULE WORKFLOW STATES
--
-- 保存某次 Module Attempt 当前执行到哪个 Workflow Step。
--
-- Workflow Definition 是模板；
-- Module Workflow State 是实际运行状态。
--
-- 每个 Attempt 一条 Workflow State。
--
-- Attempt 创建事务必须验证（后端保证）：
-- Workflow 属于当前 Module 且 status = published、
-- Entry / Next / Failure Step 可达、无意外死循环、
-- 绑定的 Prompt Version 均已 published。
-- =========================================================

create table module_workflow_states (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null,

  module_attempt_id uuid not null,

  -- 冗余列：组合外键闭环，
  -- 保证 Workflow 属于该 Attempt 的 Module Definition
  program_run_module_id uuid not null,
  module_definition_id uuid not null,

  workflow_definition_id uuid not null,

  current_step_id uuid,

  status text not null default 'not_started'
    check (
      status in (
        'not_started',
        'in_progress',
        'waiting_for_user',
        'waiting_for_system',
        'completed',
        'failed',
        'cancelled'
      )
    ),

  -- 当前步骤运行需要的少量状态
  --
  -- 不保存完整聊天记录或文件内容。
  step_state jsonb not null default '{}'::jsonb,

  started_at timestamptz,
  last_progressed_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint module_workflow_states_attempt_workspace_fk
    foreign key (
      module_attempt_id,
      workspace_id
    )
    references module_attempts (
      id,
      workspace_id
    )
    on delete cascade,

  constraint module_workflow_states_attempt_unique
    unique (
      module_attempt_id
    ),

  constraint module_workflow_states_attempt_module_fk
    foreign key (
      module_attempt_id,
      program_run_module_id
    )
    references module_attempts (
      id,
      program_run_module_id
    ),

  constraint module_workflow_states_module_definition_fk
    foreign key (
      program_run_module_id,
      module_definition_id
    )
    references program_run_modules (
      id,
      module_definition_id
    ),

  constraint module_workflow_states_workflow_module_fk
    foreign key (
      workflow_definition_id,
      module_definition_id
    )
    references workflow_definitions (
      id,
      module_definition_id
    ),

  constraint module_workflow_states_current_step_fk
    foreign key (
      current_step_id,
      workflow_definition_id
    )
    references workflow_steps (
      id,
      workflow_definition_id
    )
);


-- =========================================================
-- MCP TOOL AUDIT LOGS
--
-- 记录 Claude / OpenAI 调用了哪些 MCP Tool。
--
-- 不默认保存：
-- 完整聊天
-- 完整 Prompt
-- 文件内容
-- OAuth Token
-- Presigned URL
-- =========================================================

create table mcp_tool_audit_logs (
  id uuid primary key default gen_random_uuid(),

  request_id text not null,

  user_id uuid not null
    references users(id),

  workspace_id uuid
    references workspaces(id),

  -- 上下文层级：子级非空时父级必须非空（见表末 check），
  -- 组合外键保证 Run / Branch / Module / Attempt 相互一致
  program_run_id uuid,

  program_run_branch_id uuid,

  program_run_module_id uuid,

  module_attempt_id uuid,

  provider text not null
    check (
      provider in (
        'claude',
        'openai'
      )
    ),

  tool_name text not null,

  outcome text not null
    check (
      outcome in (
        'success',
        'denied',
        'validation_error',
        'system_error'
      )
    ),

  context_version integer,

  duration_ms integer
    check (
      duration_ms is null
      or duration_ms >= 0
    ),

  -- 只保存经过脱敏的请求元数据
  request_metadata jsonb not null default '{}'::jsonb,

  -- 只保存结果摘要，不保存完整 Artifact 内容
  result_metadata jsonb not null default '{}'::jsonb,

  error_code text,
  error_message text,

  created_at timestamptz not null default now(),

  constraint mcp_tool_audit_logs_request_unique
    unique (request_id),

  constraint mcp_tool_audit_logs_tool_name_not_blank
    check (
      length(trim(tool_name)) > 0
    ),

  constraint mcp_tool_audit_logs_run_fk
    foreign key (program_run_id, workspace_id)
    references program_runs (id, workspace_id),

  constraint mcp_tool_audit_logs_branch_fk
    foreign key (program_run_branch_id, program_run_id, workspace_id)
    references program_run_branches (id, program_run_id, workspace_id),

  constraint mcp_tool_audit_logs_module_fk
    foreign key (program_run_module_id, program_run_branch_id)
    references program_run_modules (id, program_run_branch_id),

  constraint mcp_tool_audit_logs_attempt_fk
    foreign key (module_attempt_id, program_run_module_id)
    references module_attempts (id, program_run_module_id),

  constraint mcp_tool_audit_logs_context_hierarchy_check
    check (
      (program_run_id is null or workspace_id is not null)
      and (program_run_branch_id is null or program_run_id is not null)
      and (program_run_module_id is null or program_run_branch_id is not null)
      and (module_attempt_id is null or program_run_module_id is not null)
    )
);


-- section 6

-- =========================================================
-- 后置外键（DEFERRED FOREIGN KEYS）
--
-- 以下外键因建表顺序或循环引用，
-- 统一在全部表创建完成后添加。
--
-- 未指定 on delete 的均为默认 no action：
-- 删除被引用记录前需先由应用层解除引用；
-- 同一语句内的级联删除在语句结束时统一校验，不受影响。
-- =========================================================

-- 头像必须是本人拥有的文件（跨用户引用被拒绝）
alter table user_profiles
  add constraint user_profiles_avatar_storage_fk
  foreign key (avatar_storage_object_id, user_id)
  references storage_objects (id, owner_user_id);

-- Logo 必须是本 Workspace 的文件（跨 Workspace 引用被拒绝）
alter table workspaces
  add constraint workspaces_logo_storage_fk
  foreign key (logo_storage_object_id, id)
  references storage_objects (id, workspace_id);

-- 当前激活 Venture 必须属于当前激活 Workspace
alter table user_active_contexts
  add constraint user_active_contexts_venture_fk
  foreign key (active_venture_id, active_workspace_id)
  references ventures (id, workspace_id);

-- Active Branch 必须属于本 Run
alter table program_runs
  add constraint program_runs_active_branch_fk
  foreign key (active_branch_id, id, workspace_id)
  references program_run_branches (id, program_run_id, workspace_id);

-- 父 Branch 必须属于同一 Run
alter table program_run_branches
  add constraint program_run_branches_parent_fk
  foreign key (parent_branch_id, program_run_id, workspace_id)
  references program_run_branches (id, program_run_id, workspace_id);

-- 分叉来源 Module 必须属于 Parent Branch
alter table program_run_branches
  add constraint program_run_branches_forked_module_fk
  foreign key (forked_from_run_module_id, parent_branch_id)
  references program_run_modules (id, program_run_branch_id);

-- 分叉来源 Attempt 必须属于该分叉 Module
-- （来源 Attempt 已 accepted：由后端创建 Branch 的事务保证）
alter table program_run_branches
  add constraint program_run_branches_forked_attempt_fk
  foreign key (forked_from_attempt_id, forked_from_run_module_id)
  references module_attempts (id, program_run_module_id);

-- inherited Module 指向同一 Workspace 内父 Branch 的 Module
alter table program_run_modules
  add constraint program_run_modules_inherited_fk
  foreign key (inherited_from_run_module_id, workspace_id)
  references program_run_modules (id, workspace_id);

-- inherited Module 必须与来源 Module 使用相同 Module Definition
alter table program_run_modules
  add constraint program_run_modules_inherited_same_definition_fk
  foreign key (inherited_from_run_module_id, module_definition_id)
  references program_run_modules (id, module_definition_id);

-- Active / Accepted Attempt 必须属于该 Module
alter table program_run_modules
  add constraint program_run_modules_active_attempt_fk
  foreign key (active_attempt_id, id)
  references module_attempts (id, program_run_module_id);

alter table program_run_modules
  add constraint program_run_modules_accepted_attempt_fk
  foreign key (accepted_attempt_id, id)
  references module_attempts (id, program_run_module_id);

-- Workflow 入口 Step 必须存在于该 Workflow 中
-- deferrable：允许同一事务内先建 Definition 再建 Steps
alter table workflow_definitions
  add constraint workflow_definitions_entry_step_fk
  foreign key (id, entry_step_key)
  references workflow_steps (workflow_definition_id, step_key)
  deferrable initially deferred;

-- Render Job 的输入文件必须属于本 Submission
-- （与 artifact_files.render_job_id 互相引用，故后置）
alter table artifact_render_jobs
  add constraint artifact_render_jobs_input_file_fk
  foreign key (artifact_submission_id, input_storage_object_id)
  references artifact_files (artifact_submission_id, storage_object_id);


-- section 7

-- =========================================================
-- 常用外键 / 查询索引
--
-- PostgreSQL 只为主键和 UNIQUE 自动建索引，
-- 不会为外键引用列建索引，需主动补齐。
-- =========================================================

create index idx_sessions_user on sessions (user_id);
create index idx_accounts_user on accounts (user_id);
create index idx_ventures_workspace on ventures (workspace_id);
create index idx_invitations_workspace on invitations (workspace_id);
create index idx_storage_objects_workspace on storage_objects (workspace_id);
create index idx_program_runs_venture_status on program_runs (venture_id, status);
create index idx_program_run_branches_run_status on program_run_branches (program_run_id, status);
create index idx_program_run_modules_branch_status on program_run_modules (program_run_branch_id, status);
create index idx_module_attempts_module_status on module_attempts (program_run_module_id, status);
create index idx_module_responses_attempt on module_responses (module_attempt_id);
create index idx_artifact_submissions_attempt on artifact_submissions (module_attempt_id);
create index idx_artifact_files_submission on artifact_files (artifact_submission_id);
create index idx_artifact_validations_submission on artifact_validations (artifact_submission_id);
create index idx_program_run_events_run_time on program_run_events (program_run_id, created_at);
create index idx_module_events_module_time on module_events (program_run_module_id, created_at);
create index idx_mcp_tool_audit_logs_user_time on mcp_tool_audit_logs (user_id, created_at);


-- section 8

-- =========================================================
-- 触发器
-- =========================================================

-- ---------------------------------------------------------
-- 1. updated_at 自动更新
--    default now() 只在 INSERT 生效，UPDATE 需触发器
-- ---------------------------------------------------------

create function set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

do $do$
declare
  r record;
begin
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'updated_at'
      and t.table_type = 'BASE TABLE'
  loop
    execute format(
      'create trigger %I before update on %I
         for each row execute function set_updated_at()',
      r.table_name || '_set_updated_at',
      r.table_name
    );
  end loop;
end;
$do$;

-- ---------------------------------------------------------
-- 2. 不可变性：published / retired 的 Prompt 内容不可修改
--    draft 可改；published 只能创建新版本；retired 只读
-- ---------------------------------------------------------

create function prompt_versions_freeze()
returns trigger
language plpgsql
as $fn$
begin
  -- 状态机：draft → published → retired，禁止回退
  if not (
       (old.status = 'draft'
        and new.status in ('draft', 'published'))
    or (old.status = 'published'
        and new.status in ('published', 'retired'))
    or (old.status = 'retired'
        and new.status = 'retired')
  ) then
    raise exception
      'prompt_versions %: 状态只能 draft → published → retired，不可跳过或回退',
      old.id;
  end if;

  -- published / retired：内容与身份不可修改
  if old.status in ('published', 'retired') and (
       new.prompt_definition_id is distinct from old.prompt_definition_id
    or new.version_number       is distinct from old.version_number
    or new.content              is distinct from old.content
    or new.content_format       is distinct from old.content_format
    or new.variable_config      is distinct from old.variable_config
    or new.created_by_user_id   is distinct from old.created_by_user_id
    or new.published_by_user_id is distinct from old.published_by_user_id
    or new.published_at         is distinct from old.published_at
    or new.created_at           is distinct from old.created_at
  ) then
    raise exception
      'prompt_versions %: published/retired 版本内容不可修改，请创建新版本',
      old.id;
  end if;

  -- retired：除 updated_at 外完全只读
  if old.status = 'retired'
     and new.retired_at is distinct from old.retired_at then
    raise exception
      'prompt_versions %: retired 版本只读', old.id;
  end if;

  return new;
end;
$fn$;

create trigger prompt_versions_freeze
  before update on prompt_versions
  for each row execute function prompt_versions_freeze();

-- ---------------------------------------------------------
-- 3. 不可变性：Workflow 发布后 Steps 不可增删改
-- ---------------------------------------------------------

create function workflow_steps_freeze()
returns trigger
language plpgsql
as $fn$
declare
  wf_id uuid;
  wf_status text;
begin
  -- 禁止把 Step 从一个 Workflow 移到另一个
  -- （否则可从 Published Workflow 迁出到 Draft 再修改）
  if tg_op = 'UPDATE'
     and new.workflow_definition_id is distinct from old.workflow_definition_id then
    raise exception
      'workflow_steps %: workflow_definition_id 不允许修改', old.id;
  end if;

  if tg_op = 'DELETE' then
    wf_id := old.workflow_definition_id;
  else
    wf_id := new.workflow_definition_id;
  end if;

  select status into wf_status
    from workflow_definitions
   where id = wf_id;

  if wf_status is not null and wf_status <> 'draft' then
    raise exception
      'workflow_definitions %: 非 draft 状态的 Workflow，其 Steps 不可修改',
      wf_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$fn$;

create trigger workflow_steps_freeze
  before insert or update or delete on workflow_steps
  for each row execute function workflow_steps_freeze();

-- ---------------------------------------------------------
-- 4. 不可变性：Attempt 提交后 Responses 冻结
--    验证失败后通过新的 Retry Attempt 继续
-- ---------------------------------------------------------

create function module_responses_freeze()
returns trigger
language plpgsql
as $fn$
declare
  aid uuid;
  attempt_status text;
begin
  -- 禁止把 Response 移动到其他 Attempt
  -- （否则可将冻结 Response 迁到 Draft Attempt 再修改）
  if tg_op = 'UPDATE'
     and new.module_attempt_id is distinct from old.module_attempt_id then
    raise exception
      'module_responses %: module_attempt_id 不允许修改', old.id;
  end if;

  if tg_op = 'DELETE' then
    aid := old.module_attempt_id;
  else
    aid := new.module_attempt_id;
  end if;

  select status into attempt_status
    from module_attempts
   where id = aid;

  if attempt_status is not null
     and attempt_status not in ('draft', 'in_progress') then
    raise exception
      'module_attempts %: Attempt 已提交，Responses 已冻结，请通过 Retry Attempt 继续',
      aid;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$fn$;

create trigger module_responses_freeze
  before insert or update or delete on module_responses
  for each row execute function module_responses_freeze();

-- ---------------------------------------------------------
-- 5. 不可变性：Workflow Definition 状态机与身份冻结
--    draft → published → retired，禁止回退；
--    published/retired 的身份、版本、入口不可修改
-- ---------------------------------------------------------

create function workflow_definitions_freeze()
returns trigger
language plpgsql
as $fn$
begin
  if not (
       (old.status = 'draft'
        and new.status in ('draft', 'published'))
    or (old.status = 'published'
        and new.status in ('published', 'retired'))
    or (old.status = 'retired'
        and new.status = 'retired')
  ) then
    raise exception
      'workflow_definitions %: 状态只能 draft → published → retired，不可跳过或回退',
      old.id;
  end if;

  if old.status in ('published', 'retired') and (
       new.module_definition_id  is distinct from old.module_definition_id
    or new.workflow_key          is distinct from old.workflow_key
    or new.version_number        is distinct from old.version_number
    or new.name                  is distinct from old.name
    or new.description           is distinct from old.description
    or new.entry_step_key        is distinct from old.entry_step_key
    or new.created_by_user_id    is distinct from old.created_by_user_id
    or new.published_by_user_id  is distinct from old.published_by_user_id
    or new.published_at          is distinct from old.published_at
    or new.created_at            is distinct from old.created_at
  ) then
    raise exception
      'workflow_definitions %: published/retired 的身份、版本与入口不可修改，请创建新版本',
      old.id;
  end if;

  if old.status = 'retired'
     and new.retired_at is distinct from old.retired_at then
    raise exception
      'workflow_definitions %: retired 只读', old.id;
  end if;

  return new;
end;
$fn$;

create trigger workflow_definitions_freeze
  before update on workflow_definitions
  for each row execute function workflow_definitions_freeze();

-- ---------------------------------------------------------
-- 6. 不可变性：Review Snapshot 一经生成不可改、不可单独删除
--    仅允许随 Attempt 级联删除。
--    若业务将来需要重新生成，应改为
--    snapshot_version + superseded_at，而不是覆盖旧 Snapshot。
-- ---------------------------------------------------------

create function module_review_context_snapshots_freeze()
returns trigger
language plpgsql
as $fn$
begin
  if tg_op = 'UPDATE' then
    raise exception
      'module_review_context_snapshots %: Snapshot 生成后不可修改', old.id;
  end if;

  -- DELETE：仅允许随 Attempt 级联删除
  if exists (
    select 1 from module_attempts
     where id = old.module_attempt_id
  ) then
    raise exception
      'module_review_context_snapshots %: Snapshot 不可单独删除', old.id;
  end if;

  return old;
end;
$fn$;

create trigger module_review_context_snapshots_freeze
  before update or delete on module_review_context_snapshots
  for each row execute function module_review_context_snapshots_freeze();

-- ---------------------------------------------------------
-- 7. 软删除联动：撤销 Session、拒绝已删除用户新建 Session
--    Cookie 缓存 / JWT / OAuth 登录拦截仍需 Auth Middleware
-- ---------------------------------------------------------

create function users_soft_delete_revoke_sessions()
returns trigger
language plpgsql
as $fn$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from sessions where user_id = new.id;
  end if;
  return new;
end;
$fn$;

create trigger users_soft_delete_revoke_sessions
  after update on users
  for each row execute function users_soft_delete_revoke_sessions();

create function sessions_reject_deleted_user()
returns trigger
language plpgsql
as $fn$
begin
  if exists (
    select 1 from users
     where id = new.user_id
       and deleted_at is not null
  ) then
    raise exception
      'users %: 已删除用户不能创建或更新 Session', new.user_id;
  end if;
  return new;
end;
$fn$;

create trigger sessions_reject_deleted_user
  before insert or update on sessions
  for each row execute function sessions_reject_deleted_user();

-- ---------------------------------------------------------
-- 8. 删除保护：published / retired 的版本化记录不可删除
--    （含被 prompt_definitions / module_definitions 级联删除时）
--    draft 允许物理删除
-- ---------------------------------------------------------

create function versioned_records_delete_guard()
returns trigger
language plpgsql
as $fn$
begin
  if old.status <> 'draft' then
    raise exception
      '% %: published/retired 记录不可删除，请使用 retired 状态',
      tg_table_name,
      old.id;
  end if;
  return old;
end;
$fn$;

create trigger prompt_versions_delete_guard
  before delete on prompt_versions
  for each row execute function versioned_records_delete_guard();

create trigger workflow_definitions_delete_guard
  before delete on workflow_definitions
  for each row execute function versioned_records_delete_guard();

-- ---------------------------------------------------------
-- 9. Email 写入时标准化（lower + trim）
--    使 users_email_unique 同时服务
--    Better Auth 精确查询与真实唯一性
-- ---------------------------------------------------------

create function normalize_email()
returns trigger
language plpgsql
as $fn$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$fn$;

create trigger users_normalize_email
  before insert or update of email on users
  for each row execute function normalize_email();

create trigger invitations_normalize_email
  before insert or update of email on invitations
  for each row execute function normalize_email();

-- =========================================================
-- （模板）应用账号权限收敛
--
-- 业务历史禁止 hard delete：将 app_role 替换为
-- 实际应用连接角色后取消注释执行。
-- Migration / Admin 账号保留 DELETE，
-- 用于合规清除与运维。
-- =========================================================

-- revoke delete on table
--   users,
--   workspaces,
--   ventures,
--   company_profiles,
--   program_runs,
--   program_run_branches,
--   program_run_modules,
--   module_attempts,
--   module_responses,
--   module_review_context_snapshots,
--   artifact_submissions,
--   artifact_files,
--   artifact_render_jobs,
--   artifact_validations,
--   storage_objects,
--   program_run_events,
--   module_events,
--   mcp_tool_audit_logs
-- from app_role;
