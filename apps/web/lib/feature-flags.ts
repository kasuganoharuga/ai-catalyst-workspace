// Build-time switches for parts of the product that are deliberately
// hidden rather than removed. Each one has a working implementation still
// in the tree behind it — flipping the constant back to `true` restores
// the old behaviour without a migration, a content version bump, or any
// data change.
//
// Deliberately plain constants, not environment variables: these are
// product decisions that ship with the build, not per-deployment
// configuration, and a `false` literal lets the bundler drop the dead
// branches.

/**
 * Module 0 ("Setup and Connection") as a Founder-visible step.
 *
 * Its only output is `Founder-Toolkit-Setup-Summary.md`, which is rendered
 * entirely by the system (see
 * packages/services/src/module/internal/setup-summary.ts) — the Module has
 * no questions and `completion_mode = 'system'`, so a Founder reading it
 * and pressing Confirm has no judgement to make. The connectivity checks
 * it performs are still valuable and still run: `autoCompleteSetupModule`
 * drives the same Attempt → validation → confirmation path server-side
 * when the Founder's Run is opened.
 *
 * While this is false: nothing links to the Module, it is filtered out of
 * the catalog and the next-module resolver, and `/modules/module-00-setup`
 * stays reachable by direct URL for support and debugging.
 */
export const SHOW_SETUP_MODULE = false;

/**
 * Linking a Claude Project to a Venture (the optional post-Module-1 card
 * and the Venture field on /workspace).
 *
 * Hidden because it made the primary path worse: once a Project id was
 * saved, every "Continue in Claude" button switched from
 * `claude://claude.ai/new?q=<prompt>` to `claude://claude.ai/project/<id>`,
 * and that URL form cannot carry a prompt — so the founder had to copy and
 * paste the starter line by hand. With this off, every hand-off is a new
 * chat with the prompt already in it.
 *
 * `ventures.claude_project_id` and its Service functions are untouched.
 * Before re-enabling, fix the input to accept a pasted
 * `claude.ai/project/...` URL — `extractClaudeProjectId` in
 * app/(app)/lib/module-display.ts already does this and is simply not
 * wired up.
 */
export const SHOW_CLAUDE_PROJECT = false;
