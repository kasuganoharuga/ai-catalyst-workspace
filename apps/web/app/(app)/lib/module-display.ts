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

export type StatusTone = "muted" | "accent" | "ink" | "warning";

export interface ModuleDisplayStatus {
  label: string;
  tone: StatusTone;
}

const RUN_STATUS_DISPLAY: Record<RunModuleStatus, ModuleDisplayStatus> = {
  locked: { label: "Locked", tone: "muted" },
  inherited: { label: "Carried over", tone: "muted" },
  available: { label: "Ready to start", tone: "accent" },
  in_progress: { label: "In progress", tone: "accent" },
  ready_to_unlock: { label: "Almost there", tone: "accent" },
  completed: { label: "Completed", tone: "accent" },
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
      return { label: "Checking your work", tone: "accent" };
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

export const CLAUDE_CONNECTOR_SETTINGS_URL =
  "https://claude.ai/settings/connectors";

export function startModulePrompt(moduleTitle: string): string {
  return `Let's work on "${moduleTitle}" from my AI Catalyst Founder Toolkit. Please pick up wherever I left off.`;
}
