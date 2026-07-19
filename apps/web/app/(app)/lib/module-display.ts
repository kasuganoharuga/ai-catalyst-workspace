import type { ModuleAttemptStatus, RunModuleStatus } from "@ai-catalyst/shared";

// Presentation-only mapping from the Run/Attempt state machines to what a
// Founder should read on screen. Pure and server-safe — no business rules
// live here (those stay in packages/services); this only picks words and
// colours for states the Services have already decided.

// Content-stable module keys from the seeded program content
// (packages/services/src/content-seed/content) — the two Modules the V1
// status UI knows by name.
export const MODULE_0_KEY = "module-00-setup";
export const MODULE_1_KEY = "module-01-pressure-test";

// Module 1's decision-stage question keys (content-seed module-1.ts) —
// shown as "Your decision" rather than counted alongside the six core
// questions, in both the checklist and the run panel's progress line.
export const DECISION_QUESTION_KEYS = new Set([
  "initial_decision",
  "final_decision",
  "pivot_detail",
]);

// How many --module-accent-N custom properties globals.css defines.
// Indices wrap, so the programme can grow past seven modules without a
// code change — module 7 simply reuses module 0's hue.
const MODULE_ACCENT_COUNT = 7;

/**
 * Background for a module's number badge — the single element allowed to
 * carry a module's identity colour. Returned as an inline style rather
 * than a class because the index is dynamic and Tailwind can only see
 * class names it can read statically.
 */
export function moduleAccentStyle(sequenceIndex: number): {
  backgroundColor: string;
} {
  const index =
    ((sequenceIndex % MODULE_ACCENT_COUNT) + MODULE_ACCENT_COUNT) %
    MODULE_ACCENT_COUNT;
  return { backgroundColor: `var(--module-accent-${index})` };
}

// Fill treatments, not hues — see components/status-badge.tsx for why.
// "module" is the exception: it resolves to the module's own accent at
// render time, which is why StatusBadge needs the module index for it.
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

/**
 * The one label shown for a Module's current state. The active Attempt's
 * status refines the coarse Run-module status where the difference matters
 * to a Founder: "in progress" reads very differently from "waiting on your
 * mentor" or "needs another pass".
 */
export function deriveModuleDisplayStatus(
  runStatus: RunModuleStatus,
  activeAttemptStatus: ModuleAttemptStatus | null | undefined,
): ModuleDisplayStatus {
  if (runStatus === "in_progress") {
    if (activeAttemptStatus === "ready_for_review") {
      return { label: "Ready for review", tone: "ink" };
    }
    if (activeAttemptStatus === "validation_failed") {
      return { label: "Needs another pass", tone: "warning" };
    }
    if (activeAttemptStatus === "submitted") {
      return { label: "Checking your work", tone: "soft" };
    }
  }
  return RUN_STATUS_DISPLAY[runStatus];
}

/**
 * Deep link that opens a fresh Claude chat with a starter message filled
 * in. The connector does the rest — no Skill download, no copy-pasted
 * instructions.
 */
export function claudeChatUrl(prompt: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}

/** Deep link to an existing Claude Chat Project (Desktop or browser handler). */
export function claudeChatProjectUrl(projectId: string): string {
  return `claude://claude.ai/project/${projectId}`;
}

/** Browser URL for the same Claude Chat Project. */
export function claudeChatProjectWebUrl(projectId: string): string {
  return `https://claude.ai/project/${projectId}`;
}

export const CLAUDE_CONNECTOR_SETTINGS_URL =
  "https://claude.ai/settings/connectors";

/** Opens Claude Desktop Cowork with a prefilled composer (`claude://` deep link). */
export function claudeCoworkUrl(prompt: string): string {
  return `claude://cowork/new?q=${encodeURIComponent(prompt)}`;
}

export function mcpConnectCoworkPrompt(endpointUrl: string | null): string {
  const addressLine = endpointUrl
    ? `Use this MCP address: ${endpointUrl}`
    : "Use the workspace address from my AI Catalyst connection page.";
  return `Help me connect my AI Catalyst Founder Toolkit. In Claude, open Settings → Connectors → Add custom connector. ${addressLine}`;
}

export function startModulePrompt(moduleTitle: string): string {
  return `Let's work on "${moduleTitle}" from my AI Catalyst Founder Toolkit. Please pick up wherever I left off.`;
}
