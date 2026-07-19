// Mirrors the `user_profiles.preferred_ai_provider` check constraint in
// infra/database/migrations/0001_aidb_v5_baseline.sql.
export type PreferredAiProvider = "claude" | "openai";

// External DTO — always JSON-safe (ISO string timestamps, never `Date`),
// same convention as `Venture`/`ModuleAttempt`. Mapped once at the Service
// boundary (packages/services/src/profile).
//
// Every field except `userId` is nullable: `user_profiles` rows are
// created lazily on first save, so a Founder who has never opened the
// profile page has no row at all and reads back an all-null profile
// rather than a 404.
export interface UserProfile {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  contactEmail: string | null;
  preferredAiProvider: PreferredAiProvider | null;
  jobTitle: string | null;
  bio: string | null;
  linkedinUrl: string | null;
  locale: string;
  createdAt: string | null;
  updatedAt: string | null;
}

// The subset the website lets a Founder edit. Deliberately excludes
// `locale` (no UI for it yet), `avatar_storage_object_id` (needs the
// upload path) and `last_active_at` (system-maintained).
export interface UpdateUserProfileInput {
  firstName?: string | null;
  lastName?: string | null;
  contactEmail?: string | null;
  jobTitle?: string | null;
  bio?: string | null;
  linkedinUrl?: string | null;
}

// Name-formatting helpers deliberately live in apps/web/lib/user-profile.ts
// rather than here: they are presentation logic with no server-side
// consumer, and this package's index is type-only by design — a runtime
// export from it cannot be resolved by Turbopack when apps/web bundles
// the workspace source directly (see packages/services/src/mcp-auth's
// header comment for the same constraint).
