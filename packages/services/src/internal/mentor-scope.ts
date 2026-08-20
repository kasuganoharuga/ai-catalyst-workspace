// --- Mentor read scope ---

/**
 * Mentor read scope. true = every Founder on the platform is visible to
 * every Mentor; false = a Mentor only sees Founders whose Workspace
 * `mentor_user_id` points at them.
 *
 * Same shape as apps/web/lib/feature-flags.ts (a build-time constant, not
 * an env var, so the bundler drops the dead branch) but this one has to
 * live in services: .dependency-cruiser.js's services-cannot-import-web-or-mcp
 * rule forbids importing the web flags file from here.
 *
 * `workspaces.mentor_user_id` itself is unaffected by this flag — it
 * remains the assignment/ownership field (admin's assignWorkspaceMentor,
 * invitation-time attribution, mentor soft-delete cleanup). This flag only
 * controls whether that column also gates *visibility*.
 */
export const MENTOR_SEES_ALL_FOUNDERS = true;
