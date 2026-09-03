// ── Connection ──────────────────────────────────────────────────────────

export interface ManualStep {
  title: string;
  body: string;
  /** Only the first step links out to the assistant's settings. */
  linkLabel?: string;
  /** Renders the workspace address (with copy button) in this step. */
  showAddress?: boolean;
  /** Tagged in the UI as optional, not a missed requirement. */
  optional?: boolean;
  /** Schematic beside this step (not a screenshot — these UIs move). */
  illustration?: StepIllustrationKey;
}

/**
 * Keys into STEP_ILLUSTRATIONS in connection/components/step-illustrations.
 * A tuple rather than a bare union so a node-environment test can check
 * every step's illustration exists without importing the TSX registry.
 */
export const STEP_ILLUSTRATION_KEYS = [
  "connectors",
  "add-connector",
  "paste-address",
  "approve",
  "allow-tools",
  "chatgpt-settings",
  "chatgpt-plugins",
  "chatgpt-add-server",
  "chatgpt-custom-mcp",
  "chatgpt-approve",
] as const;

export type StepIllustrationKey = (typeof STEP_ILLUSTRATION_KEYS)[number];

/** Connection-page copy that reads the same whichever assistant is chosen. */
export const connectionCopy = {
  kicker: "Setup",
  // Connected state: header must not still read as setup instructions.
  kickerConnected: "Your account",

  addressHeading: "Your workspace address",
  // Never name the env var — a founder can't act on it.
  addressMissing:
    "This workspace isn't set up for connections yet. Contact your program lead.",

  // Covers every way a founder who has connected before arrives here
  // without a connection: the grant lapsed, they disconnected by hand, or
  // they switched assistant (which signs the old one out). Saying
  // "expired" was a guess, and after a deliberate switch it read as
  // something having gone wrong.
  expiredTitle: "You'll need to connect again",
  repairTitle: "Repair connection",
  repairBody:
    "Follow the steps below to reconnect. Leave this tab open — it refreshes as soon as access is approved, including when you switch back to it.",

  troubleshootingTitle: "If something doesn't look right",
  watchRetry: "Try again",

  // Shown only for the ChatGPT/OpenAI path, and only as a Codex CLI
  // fallback — ordinary ChatGPT desktop setup stays the primary path.
  codexCliTitle: "If you're connecting through Codex",
  codexCliBody:
    "When the desktop Plugins flow fails, add and log in to the MCP server from the Codex CLI, then return to this tab.",
  codexCliAddLabel: "Add the server",
  codexCliLoginLabel: "Log in",

  disconnectCta: "Disconnect",
  disconnectPending: "Disconnecting…",

  statusHeading: "Connection status",
  statusClient: "Connected to",
  // Lapse date if unused — the connection renews each time it is used.
  statusValidUntil: "Stays connected until",
  statusNeverUsed: "Not yet",

  privacyLabel: "What this connection does:",

  // Read-only on this page; the switch itself lives on the profile page,
  // beside the rest of what a founder owns about their account.
  assistantLabel: "Your AI assistant",
  assistantChangeLink: "Change it in your profile",
  // Connected with one assistant while set up for another. Not a state the
  // product produces any more — switching disconnects, and connecting sets
  // the preference — so this only appears if a disconnect failed part-way.
  assistantMismatch: (connected: string, chosen: string) =>
    `Connected with ${connected}, though your instructions are set to ${chosen}. Disconnect below, or switch back to ${connected} in your profile.`,
} as const;
