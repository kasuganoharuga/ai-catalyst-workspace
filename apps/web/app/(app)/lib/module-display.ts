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

// ── ChatGPT ─────────────────────────────────────────────────────────────

/**
 * As far as this deep link goes. The scheme opens the settings window but
 * cannot address the Plugins page or the MCPs tab inside it, so the manual
 * steps carry the founder from there.
 */
export const CHATGPT_SETTINGS_DESKTOP_URL = "codex://settings";

/**
 * Opens the desktop app, nothing more. There is deliberately no browser
 * equivalent anywhere in the ChatGPT flow: the MCP server is registered in
 * the desktop app, so a chat at chatgpt.com cannot reach this workspace and
 * sending a founder there would produce an assistant that denies the
 * workspace exists.
 */
export const CHATGPT_APP_URL = "codex://";

export function startModulePrompt(moduleTitle: string): string {
  return `Let's work on "${moduleTitle}" from my AI Catalyst Founder Toolkit. Please pick up wherever I left off.`;
}
