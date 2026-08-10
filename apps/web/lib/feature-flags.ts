// Build-time product switches. Plain constants (not env vars) so the bundler
// can drop dead branches; flip back to `true` to restore behaviour without migration.

/**
 * Module 0 as a Founder-visible step.
 *
 * Hidden because it has no questions — `autoCompleteSetupModule` runs the same
 * checks server-side when the Run opens. Direct URL stays reachable for support.
 */
export const SHOW_SETUP_MODULE = false;

/**
 * Claude Project linking on the Venture.
 *
 * Hidden because `claude://claude.ai/project/<id>` cannot carry a prompt — every
 * hand-off reverts to a new chat with the starter line prefilled.
 */
export const SHOW_CLAUDE_PROJECT = false;
