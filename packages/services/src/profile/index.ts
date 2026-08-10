import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { UserProfile } from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import {
  isPreferredAiProvider,
  upsertPreferredAiProvider,
} from "@ai-catalyst/services/profile/internal/preferred-ai-provider";

// Founder-editable profile — separate from Better Auth users (auth identity).
// Display name resolves from here, falling back to users.name.

// Explicit column list — never `select *`.
const USER_PROFILE_COLUMNS = `
  user_id, first_name, last_name, contact_email, preferred_ai_provider,
  job_title, bio, linkedin_url, locale, created_at, updated_at
`;

interface UserProfileRow {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  contact_email: string | null;
  preferred_ai_provider: string | null;
  job_title: string | null;
  bio: string | null;
  linkedin_url: string | null;
  locale: string;
  created_at: Date;
  updated_at: Date;
}

function mapUserProfileRow(row: UserProfileRow): UserProfile {
  return {
    userId: row.user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    contactEmail: row.contact_email,
    // Unknown provider value from DB — surface null rather than leak an invalid union member.
    preferredAiProvider: isPreferredAiProvider(row.preferred_ai_provider)
      ? row.preferred_ai_provider
      : null,
    jobTitle: row.job_title,
    bio: row.bio,
    linkedinUrl: row.linkedin_url,
    locale: row.locale,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// Default shape when no row exists yet — rows are created on first save.
function emptyProfile(userId: string): UserProfile {
  return {
    userId,
    firstName: null,
    lastName: null,
    contactEmail: null,
    preferredAiProvider: null,
    jobTitle: null,
    bio: null,
    linkedinUrl: null,
    locale: "en-AU",
    createdAt: null,
    updatedAt: null,
  };
}

/**
 * Reads the signed-in user's profile. Scoped to actor.userId — cannot enumerate others.
 */
export async function getMyProfile(actor: ActorContext): Promise<UserProfile> {
  assertRole(actor, ["founder", "mentor", "admin"]);

  const result = await pool.query<UserProfileRow>(
    `select ${USER_PROFILE_COLUMNS} from user_profiles where user_id = $1`,
    [actor.userId],
  );
  const row = result.rows[0];
  return row ? mapUserProfileRow(row) : emptyProfile(actor.userId);
}

// --- hasChangedInvitationPassword ---

// Better Auth sets created_at === updated_at on credential insert; slack avoids clock noise.
const PASSWORD_CHANGE_SLACK_SECONDS = 1;

/**
 * Whether the user replaced their invitation password.
 * Signal: accounts.updated_at on the credential row moves after changePassword.
 * Returns true when no credential row — avoids nagging an account with no password.
 */
export async function hasChangedInvitationPassword(
  actor: ActorContext,
): Promise<boolean> {
  assertRole(actor, ["founder", "mentor", "admin"]);

  const result = await pool.query<{ changed: boolean }>(
    `select updated_at > created_at + make_interval(secs => $2) as changed
     from accounts
     where user_id = $1 and provider_id = 'credential'
     order by created_at
     limit 1`,
    [actor.userId, PASSWORD_CHANGE_SLACK_SECONDS],
  );

  return result.rows[0]?.changed ?? true;
}

// --- updateMyProfile ---

const MAX_NAME_LENGTH = 120;
const MAX_JOB_TITLE_LENGTH = 160;
const MAX_BIO_LENGTH = 2000;
const MAX_URL_LENGTH = 500;
const MAX_EMAIL_LENGTH = 320;

// Contact email only — permissive pattern, not login credential validation.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EDITABLE_FIELDS = [
  "firstName",
  "lastName",
  "contactEmail",
  "jobTitle",
  "bio",
  "linkedinUrl",
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];

const COLUMN_BY_FIELD: Record<EditableField, string> = {
  firstName: "first_name",
  lastName: "last_name",
  contactEmail: "contact_email",
  jobTitle: "job_title",
  bio: "bio",
  linkedinUrl: "linkedin_url",
};

const MAX_LENGTH_BY_FIELD: Record<EditableField, number> = {
  firstName: MAX_NAME_LENGTH,
  lastName: MAX_NAME_LENGTH,
  contactEmail: MAX_EMAIL_LENGTH,
  jobTitle: MAX_JOB_TITLE_LENGTH,
  bio: MAX_BIO_LENGTH,
  linkedinUrl: MAX_URL_LENGTH,
};

/**
 * Normalises one field. Blank strings become null (matches *_not_blank constraints).
 */
function normalizeField(
  field: EditableField,
  rawValue: unknown,
): string | null {
  if (rawValue === null) return null;
  if (typeof rawValue !== "string") {
    throw new ServiceError(
      "VALIDATION_ERROR",
      `${field} must be a string or null.`,
    );
  }

  const value = rawValue.trim();
  if (value.length === 0) return null;

  if (value.length > MAX_LENGTH_BY_FIELD[field]) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      `${field} must be ${MAX_LENGTH_BY_FIELD[field]} characters or fewer.`,
    );
  }

  if (field === "contactEmail" && !EMAIL_PATTERN.test(value)) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "contactEmail must be a valid email address.",
    );
  }

  if (field === "linkedinUrl") {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new ServiceError(
        "VALIDATION_ERROR",
        "linkedinUrl must be a full URL, including https://.",
      );
    }
    // http/https only — other schemes would be a stored-XSS vector when rendered as a link.
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new ServiceError(
        "VALIDATION_ERROR",
        "linkedinUrl must be an http or https URL.",
      );
    }
  }

  return value;
}

/**
 * Validates API input; absent keys are unchanged, explicit null clears a field.
 */
function normalizeUpdateInput(
  input: unknown,
): Map<EditableField, string | null> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ServiceError("VALIDATION_ERROR", "A profile object is required.");
  }

  const record = input as Record<string, unknown>;
  const updates = new Map<EditableField, string | null>();

  for (const field of EDITABLE_FIELDS) {
    if (!(field in record)) continue;
    if (record[field] === undefined) continue;
    updates.set(field, normalizeField(field, record[field]));
  }

  if (updates.size === 0) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "No editable profile fields were supplied.",
    );
  }

  return updates;
}

/**
 * Creates or updates the signed-in user's profile. Partial updates never clear omitted fields.
 */
export async function updateMyProfile(
  actor: ActorContext,
  input: unknown,
): Promise<UserProfile> {
  assertRole(actor, ["founder", "mentor", "admin"]);
  const updates = normalizeUpdateInput(input);

  const fields = [...updates.keys()];
  const columns = fields.map((field) => COLUMN_BY_FIELD[field]);
  const values = fields.map((field) => updates.get(field) ?? null);

  // $1 is user_id; supplied columns start at $2.
  const insertColumns = ["user_id", ...columns].join(", ");
  const insertPlaceholders = values.map((_, index) => `$${index + 2}`);
  const setClause = columns
    .map((column, index) => `${column} = $${index + 2}`)
    .join(", ");

  const result = await pool.query<UserProfileRow>(
    `insert into user_profiles (${insertColumns})
     values ($1, ${insertPlaceholders.join(", ")})
     on conflict (user_id) do update
       set ${setClause}, updated_at = now()
     returning ${USER_PROFILE_COLUMNS}`,
    [actor.userId, ...values],
  );

  const row = result.rows[0];
  if (!row) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      "Profile upsert returned no row.",
    );
  }
  return mapUserProfileRow(row);
}

// --- setPreferredAiProvider ---

/**
 * Records which AI assistant the user set up. Separate from updateMyProfile so
 * profile saves cannot clear it and the first-run dialog cannot reopen.
 */
export async function setPreferredAiProvider(
  actor: ActorContext,
  provider: unknown,
): Promise<UserProfile> {
  assertRole(actor, ["founder", "mentor", "admin"]);

  if (!isPreferredAiProvider(provider)) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "preferredAiProvider must be 'claude' or 'openai'.",
    );
  }

  await upsertPreferredAiProvider(pool, actor.userId, provider);

  // upsertPreferredAiProvider has no return value — read back the full profile here.
  const result = await pool.query<UserProfileRow>(
    `select ${USER_PROFILE_COLUMNS} from user_profiles where user_id = $1`,
    [actor.userId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      "Preferred AI provider upsert returned no row.",
    );
  }
  return mapUserProfileRow(row);
}
