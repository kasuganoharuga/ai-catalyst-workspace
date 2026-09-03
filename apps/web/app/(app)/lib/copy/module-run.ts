import { MODULE_BRIEF_COPY } from "./module-brief";

// ── Standard modules (1-4 today) ────────────────────────────────────────
//
// Split into a shared skeleton every standard Module's three-step wizard
// renders the same way (`moduleRunCopy`), and a per-Module table for
// everything that names what the Module actually produces
// (`MODULE_BRIEF_COPY`) — the brief's title and body, why it matters, the
// "before you begin" list, the questions label, and what the confirm step
// calls the saved document(s). `resolveModuleCopy` merges the two so a
// component only ever reads one flat object.
//
// Module 1 was the only standard Module before this split and its strings
// below are carried over unchanged; Modules 2-4's are drawn from their own
// reviewed prompt sets (skills/module-0N-*/prompts/module-0N-prompt-set.md),
// not invented fresh.

export const moduleRunCopy = {
  stepBrief: "What this is",
  stepDocuments: "Upload documents",
  stepWork: "Work through it",
  stepConfirm: "Confirm and unlock",

  whyHeading: "Why it matters",
  beforeHeading: "Before you begin",

  documentsTitle: "Give your assistant what you've already got",
  // Fallback only — every live Module overrides this with something
  // specific to what it actually asks for. The "optional" reassurance
  // lives in the suggestions panel, so it is not repeated here.
  documentsBody:
    "Anything already written down that bears on this module. Your assistant reads it at the start of the conversation, so you will not need to paste it in.",

  workTitle: "Work through it in your AI assistant",
  workBody:
    "Send the message below. The questions come one at a time. This page updates as answers are saved, so you can leave and come back.",
  // Locked vs not-started need different copy — connection and prior-module gates differ.
  workBodyLocked:
    "A preview of how this module works. You can start it once you finish the module before it.",
  workBodyNotStarted:
    "A preview of how this module works. The steps go live once your AI assistant is connected.",
  workLockedNote:
    "Starting this module unlocks after you finish the previous one.",
  workNotStartedNote:
    "Connect your AI assistant first. This message then opens a chat that starts the module.",

  notConnected:
    "No AI assistant is connected to this workspace yet, so nothing can be saved.",
  notConnectedLink: "Connect one",
  notConnectedSuffix: ", then come back.",

  questionsCount: (answered: number, total: number) =>
    `${answered} / ${total} answered`,

  progressChecks: "Everything required is included.",
  progressChecksDone: "Read it over whenever you're ready.",
  progressChecksPending: "Happens automatically once your documents are saved.",

  confirmNoFileLocked:
    "You can look ahead here. You'll be able to start this module and save your documents once the one before it is done.",
  confirmNoFileNotStarted:
    "You can look ahead here. Sign-off appears once your documents have been saved.",
  confirmUnavailable: "Sign-off opens along with this module.",
  confirmFinishFirst: "Finish the conversation in the previous step first.",
  /** Heading when ≥1 output is saved but the attempt is not yet ready_for_review. */
  confirmDocumentsSavedTitle: "Documents saved",
  confirmDocumentsSavedBody:
    "Your documents are in the workspace. Checking completion requirements…",
  /** Heading when the attempt is ready_for_review (Confirm CTA available). */
  confirmDocumentsReadyTitle: "Documents ready",
  confirmCheckingRequirements: "Checking completion requirements…",
  reviseHint:
    "Not happy with it? Ask for a revision. Nothing is locked in until you confirm.",

  documentHeading: "The document",
  documentCovers: "It should cover",
  documentRead: "Read document",
  // Trigger label for a menu that always offers more than one format
  // (Word is unconditional) — kept generic rather than naming one format.
  documentDownload: "Download",
  // Shown instead of documentDownload once a workbook exists for this
  // Artifact — same primary/secondary split as artefactsCopy's pair. Not
  // all PDF renderers are fillable (Module 2's Ideal Customer Avatar is a
  // read-only styled export), so this stays generic rather than claiming
  // "fillable" for every one of them.
  documentDownloadWorkbook: "Download PDF",
  documentDownloadSource: "Download Markdown",
  documentNotSaved: "Not saved yet.",
  // A supporting document the Module accepts but never blocks completion
  // on (Module 4's interview notes). Without this, an unsaved optional
  // document reads exactly like a missing required one.
  documentNotSavedOptional:
    "Not saved yet — sign-off doesn't wait on this one.",
  documentExpand: "Show the rest",
  documentCollapse: "Show less",
  documentOpenFull: "Open full page",
  documentMeta: (version: number, savedAt: string | null) =>
    savedAt ? `Version ${version} · ${savedAt}` : `Version ${version}`,
} as const;

/**
 * Merges the shared wizard skeleton with one Module's own brief/confirm
 * copy into the single flat object every step component reads. Falls back
 * to Module 1's table for an unrecognised key rather than throwing — every
 * live Module has its own entry above, so this path is only reachable for
 * a Module whose copy hasn't been written yet.
 */
export function resolveModuleCopy(moduleKey: string) {
  const brief =
    MODULE_BRIEF_COPY[moduleKey] ??
    MODULE_BRIEF_COPY["module-01-pressure-test"];
  return { ...moduleRunCopy, ...brief };
}

// Retained so existing call sites and the neutrality guard below keep
// working without change — always Module 1's own copy, same as before this
// file split it out of a single `module1Copy`.
export const module1Copy = resolveModuleCopy("module-01-pressure-test");

// ── Completing a Module ─────────────────────────────────────────────────
//
// Every standard Module (including Module 1, now that it has no Founder
// decision to record) reads its completion copy purely off whether a next
// Module is actually open, and never claims one exists when Module 4 (the
// last currently open Module) is confirmed.

export function moduleCompletedTitle(nextModuleTitle: string | null): string {
  return nextModuleTitle
    ? "Signed off. The next module is open."
    : "Signed off.";
}

export function moduleCompletedBody(nextModuleTitle: string | null): string {
  return nextModuleTitle
    ? `You confirmed this, which opened ${nextModuleTitle}. Your saved documents stay in your workspace.`
    : "You confirmed this. This is the last module open right now — your saved documents stay in your workspace, and more modules open as they become ready.";
}

export function moduleConfirmCta(nextModuleTitle: string | null): string {
  return nextModuleTitle
    ? "Confirm and open the next module"
    : "Confirm completion";
}
