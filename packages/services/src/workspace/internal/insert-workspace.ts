import type { PoolClient } from "pg";

import type { WorkspaceStatus } from "@ai-catalyst/shared";

import { slugifyBase } from "@ai-catalyst/services/internal/slug";

// Shared between invitation/index.ts's accept-founder-invitation flow and
// mentor/founder-preview.ts's sandbox provisioning — both need "insert a
// Workspace row for this user, retrying the slug on collision" and nothing
// else differs except the default name and (for a sandbox) `kind`.
const MAX_WORKSPACE_SLUG_ATTEMPTS = 3; // initial attempt + up to 2 retries

export interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  status: WorkspaceStatus;
}

/** Private default workspace name/slug until rename UX exists. */
export function defaultWorkspaceDetails(email: string): {
  name: string;
  base: string;
} {
  const localPart = email.split("@")[0]?.trim() ?? "";
  const base = slugifyBase(localPart, "founder");

  return { name: `${localPart || "Founder"}'s Workspace`, base };
}

// ON CONFLICT (slug) do nothing retries suffix; founder_unique 23505 still rolls back.
export async function insertWorkspaceWithRetry(
  client: PoolClient,
  founderUserId: string,
  email: string,
  createSuffix: () => string,
  mentorUserId: string | null,
  kind: "live" | "sandbox" = "live",
  /** Overrides defaultWorkspaceDetails' name — mentor/founder-preview.ts uses this so a Mentor's several sandboxes are distinguishable (e.g. "…'s Sandbox #2"), rather than every row sharing the same default name. */
  nameOverride?: string,
): Promise<WorkspaceRow> {
  const { name: defaultName, base } = defaultWorkspaceDetails(email);
  const name = nameOverride ?? defaultName;

  for (let attempt = 0; attempt < MAX_WORKSPACE_SLUG_ATTEMPTS; attempt++) {
    const slug = `${base}-${createSuffix()}`;
    const result = await client.query<WorkspaceRow>(
      `insert into workspaces (founder_user_id, name, slug, mentor_user_id, kind)
       values ($1, $2, $3, $4, $5)
       on conflict (slug) do nothing
       returning id, name, slug, status`,
      [founderUserId, name, slug, mentorUserId, kind],
    );
    if (result.rows[0]) {
      return result.rows[0];
    }
  }

  throw new Error(
    "Exhausted workspace slug retry attempts — this indicates a broken " +
      "suffix generator, not normal random-collision odds.",
  );
}
