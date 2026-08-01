import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { UserProfile } from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import {
  isPreferredAiProvider,
  upsertPreferredAiProvider,
} from "@ai-catalyst/services/profile/internal/preferred-ai-provider";

// Owns everything to do with `user_profiles`. The table is deliberately
// separate from Better Auth's `users`: `users.name`/`users.email` are
// authentication identity and are written by the auth library, while this
// is the Founder's own editable profile. The two are never merged — the
// website resolves a display name from this profile and falls back to
// `users.name` (see resolveDisplayName in apps/web/lib/user-profile.ts).

// Explicit column list (never `select *`) so a future internal-only
// column is never accidentally exposed through the DTO.
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
    // An unrecognised value can only mean the check constraint gained a
    // provider this build doesn't know about — surface null rather than
    // leaking a string the DTO's union says is impossible.
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

// The shape returned when no row exists yet. Not an error: rows are
// created on first save, so "never edited my profile" is a normal state.
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
 * Reads the signed-in user's own profile. Always returns a profile —
 * an all-null one when no `user_profiles` row exists yet.
 *
 * Scoped to the actor's own `user_id` by construction: there is no
 * parameter for reading somebody else's profile, so this can never be
 * used to enumerate other users.
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

// ---------------------------------------------------------------------
// hasChangedInvitationPassword
// ---------------------------------------------------------------------

// Better Auth stamps `created_at` and `updated_at` from a single
// `new Date()` when it inserts the credential row, so they start equal.
// A second of slack keeps sub-millisecond clock noise from reading as a
// password change; nobody changes their password inside a second of the
// account being created.
const PASSWORD_CHANGE_SLACK_SECONDS = 1;

/**
 * Whether this user has replaced the password their invitation shipped
 * with.
 *
 * The signal is `accounts.updated_at` on the `credential` row: Better
 * Auth's core schema declares that column with an `onUpdate` hook, and
 * `changePassword` writes the row through `updateAccount`, so the
 * timestamp moves forward the first time a password is set by hand.
 *
 * (An earlier comment in apps/web's dashboard claimed this could not be
 * detected. It could; nothing was reading it.)
 *
 * Returns true when there is no credential row at all. That should not
 * happen for an invited Founder, but the alternative is nagging an
 * account that has no password to change — a prompt nobody can ever
 * satisfy is worse than a prompt occasionally not shown.
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

// ---------------------------------------------------------------------
// updateMyProfile
// ---------------------------------------------------------------------

const MAX_NAME_LENGTH = 120;
const MAX_JOB_TITLE_LENGTH = 160;
const MAX_BIO_LENGTH = 2000;
const MAX_URL_LENGTH = 500;
const MAX_EMAIL_LENGTH = 320;

// Deliberately permissive: this is a contact address the Founder chooses
// to share, not a login credential, so it only has to look like an
// address rather than satisfy the full RFC.
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
 * Normalises one field's incoming value.
 *
 * Blank strings collapse to `null` rather than being stored: the table's
 * `*_not_blank` check constraints reject whitespace-only values outright,
 * and "I cleared this field" is the user's intent anyway.
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
    // http/https only — a `javascript:` or `data:` URL here would be
    // rendered as a link and become a stored-XSS vector.
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
 * Validates untrusted input crossing the API boundary and returns only
 * the fields the caller actually supplied, so an absent key means "leave
 * unchanged" while an explicit `null` means "clear this".
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
 * Creates or updates the signed-in user's own profile.
 *
 * Upserts rather than requiring a pre-existing row: `user_profiles` rows
 * are not created at sign-up or invitation acceptance, so the first save
 * is also the insert. Only the fields present in `input` are written —
 * a partial update never clears the fields it didn't mention.
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

// ---------------------------------------------------------------------
// setPreferredAiProvider
// ---------------------------------------------------------------------

/**
 * Records which AI assistant this user set the website up for.
 *
 * Deliberately its own writer rather than another entry in
 * `EDITABLE_FIELDS`. Three reasons, in increasing order of importance:
 * `normalizeField` is built around trim/length/URL/email checks on
 * nullable free text and an enum needs a different branch in three
 * separate lookup tables; `null` means "clear this" everywhere on that
 * path, but a chosen provider must never become unset again (the
 * first-run dialog keys off it being null, so clearing it would re-open
 * the dialog); and `ProfileForm` submits a whole object built from its
 * own `FormState`, so a field reachable through `updateMyProfile` would
 * be wiped by an ordinary profile save that never mentioned it.
 *
 * `UpdateUserProfileInput` therefore continues to exclude it, as its
 * comment in packages/shared already documents.
 *
 * The write itself is `upsertPreferredAiProvider` (profile/internal) —
 * this function's job is entirely the Founder-facing half: checking the
 * actor is allowed to do this and that `provider` is a value the column
 * can hold, then reading back the profile the caller needs returned. The
 * same write is also reachable from mcp-auth's recordMcpGrantIssued, when
 * connecting an assistant is how the choice got made rather than this
 * action — it calls the shared helper directly rather than going through
 * an ActorContext-shaped entry point it doesn't have one for.
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

  // upsertPreferredAiProvider doesn't return the row (its other caller,
  // recordMcpGrantIssued, never wants one), so this function reads back
  // the full profile itself, the same shape getMyProfile builds.
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
