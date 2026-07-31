import type { ModuleAttemptStatus, RunModuleStatus } from "@ai-catalyst/shared";

// Presentation-only: maps run/attempt states to labels and colours (logic stays in services).

// Content-stable module keys from content-seed — V1 status UI knows these two by name.
export const MODULE_0_KEY = "module-00-setup";
export const MODULE_1_KEY = "module-01-pressure-test";

// Module 1 decision-stage keys — shown as "Your decision", not counted with the six questions.
// Includes legacy v1 keys so older program versions still render.
export const DECISION_QUESTION_KEYS = new Set([
  "founder_decision",
  "pivot_detail",
  "initial_decision",
  "final_decision",
]);

// How many --module-accent-N vars globals.css defines; indices wrap past seven modules.
const MODULE_ACCENT_COUNT = 7;

/** Inline style for a module number badge — dynamic index, not a static Tailwind class. */
export function moduleAccentStyle(sequenceIndex: number): {
  backgroundColor: string;
} {
  const index =
    ((sequenceIndex % MODULE_ACCENT_COUNT) + MODULE_ACCENT_COUNT) %
    MODULE_ACCENT_COUNT;
  return { backgroundColor: `var(--module-accent-${index})` };
}

// Fill treatments, not hues — see status-badge.tsx. "module" resolves to the module accent at render time.
export type StatusTone =
  "muted" | "outline" | "lime" | "soft" | "ink" | "module" | "warning";

export interface ModuleDisplayStatus {
  label: string;
  tone: StatusTone;
}

const RUN_STATUS_DISPLAY: Record<RunModuleStatus, ModuleDisplayStatus> = {
  locked: { label: "Locked", tone: "muted" },
  inherited: { label: "Carried over", tone: "muted" },
  available: { label: "Ready to start", tone: "outline" },
  in_progress: { label: "In progress", tone: "lime" },
  ready_to_unlock: { label: "Almost there", tone: "outline" },
  completed: { label: "Completed", tone: "module" },
};

/** Attempt statuses that clear active_attempt_id and need a Retry to write again. */
const RETRYABLE_DISPLAY_STATUSES = new Set<ModuleAttemptStatus>([
  "validation_failed",
  "rejected",
  "cancelled",
]);

/** Module is startable but has no active attempt in a retryable terminal state. */
export function needsModuleRetry(
  runStatus: RunModuleStatus,
  activeAttemptStatus: ModuleAttemptStatus | null | undefined,
  displayAttemptStatus: ModuleAttemptStatus | null | undefined,
): boolean {
  if (runStatus !== "available" && runStatus !== "in_progress") {
    return false;
  }
  if (activeAttemptStatus) {
    return false;
  }
  return (
    displayAttemptStatus != null &&
    RETRYABLE_DISPLAY_STATUSES.has(displayAttemptStatus)
  );
}

/**
 * Label for a module's current state. Active attempt status refines coarse run status
 * where it matters. Pass display attempt status when active_attempt_id is cleared.
 */
export function deriveModuleDisplayStatus(
  runStatus: RunModuleStatus,
  activeAttemptStatus: ModuleAttemptStatus | null | undefined,
  displayAttemptStatus?: ModuleAttemptStatus | null,
): ModuleDisplayStatus {
  if (runStatus === "in_progress") {
    const attemptStatus = activeAttemptStatus ?? displayAttemptStatus ?? null;
    if (attemptStatus === "ready_for_review") {
      return { label: "Ready for review", tone: "ink" };
    }
    if (attemptStatus === "validation_failed") {
      return { label: "Needs another go", tone: "warning" };
    }
    if (attemptStatus === "rejected" || attemptStatus === "cancelled") {
      return { label: "Needs another go", tone: "warning" };
    }
    if (attemptStatus === "submitted") {
      return { label: "Checking your work", tone: "soft" };
    }
  }
  return RUN_STATUS_DISPLAY[runStatus];
}

/** Opens a fresh Claude chat with a prefilled starter message. */
export function claudeChatUrl(prompt: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}

/**
 * Desktop deep link to a Claude Chat Project. Cannot combine project + prompt —
 * use claudeChatProjectWebUrl when both are needed.
 */
export function claudeChatProjectUrl(projectId: string): string {
  return `claude://claude.ai/project/${projectId}`;
}

/** Browser URL into a Claude Chat Project. Optional prompt builds /new?project=…&q=…. */
export function claudeChatProjectWebUrl(
  projectId: string,
  prompt?: string,
): string {
  if (prompt) {
    return `https://claude.ai/new?project=${encodeURIComponent(projectId)}&q=${encodeURIComponent(prompt)}`;
  }
  return `https://claude.ai/project/${projectId}`;
}

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Extract project id from a pasted URL or bare UUID. Returns null if none found. */
export function extractClaudeProjectId(input: string): string | null {
  const match = input.trim().match(UUID_PATTERN);
  return match ? match[0].toLowerCase() : null;
}

// /customize/connectors — not /settings/connectors; no menu route in copy (UI moves break it).
export const CLAUDE_CONNECTOR_SETTINGS_DESKTOP_URL =
  "claude://claude.ai/customize/connectors";

export const CLAUDE_CONNECTOR_SETTINGS_URL =
  "https://claude.ai/customize/connectors";

/** Opens Claude Desktop with a prefilled composer (claude://claude.ai/new?q=…). */
export function claudeDesktopChatUrl(prompt: string): string {
  return `claude://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}

/** Prefill for Claude to walk through MCP connector setup — founder still approves OAuth. */
export function mcpConnectPrompt(endpointUrl: string | null): string {
  const urlBlock = endpointUrl
    ? endpointUrl
    : "(copy the workspace address from my AI Catalyst connection page)";
  return [
    "Please talk me through connecting my AI Catalyst Founder Toolkit to Claude as a custom remote MCP connector. I'll do the clicking — you can't reach these settings yourself.",
    "",
    "The steps are:",
    "1. Open my connectors — they're under Customize, at claude.ai/customize/connectors",
    "2. Add a custom connector",
    '3. Name it "AI Catalyst" and paste this as the URL:',
    urlBlock,
    "4. Open the link Claude shows, then sign in and approve in the browser",
    "5. Set the tools to always allow",
    "",
    "Take them one at a time and wait for me. If a screen doesn't match what you described, help me work out what I'm looking at — this page has moved before, so trust what I can see over the exact wording above.",
    "",
    "Two things that stop people here, so check them with me if I get stuck: custom connectors need a paid Claude plan and don't appear on Free, and on a Team or Enterprise plan only the workspace owner can add one.",
    "",
    "Don't tell me the connector is connected — you have no way to see that. The AI Catalyst website detects it and moves me on by itself.",
  ].join("\n");
}

export function startModulePrompt(moduleTitle: string): string {
  return `Let's work on "${moduleTitle}" from my AI Catalyst Founder Toolkit. Please pick up wherever I left off.`;
}
