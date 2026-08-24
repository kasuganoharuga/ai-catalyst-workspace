// ── Module 0 (setup) ────────────────────────────────────────────────────

// Hidden behind SHOW_SETUP_MODULE, but the strings live here rather than
// inline in the component so the neutrality guard can see them. The two
// functions take the assistant's name because this step is a hand-off —
// one of the two places allowed to name it.
export const module0Copy = {
  checkTitle: (assistant: string) => `Hand it over to ${assistant}`,
  checkBody: (assistant: string) =>
    `Send the line below. ${assistant} confirms it can reach your workspace, then writes and saves your Setup Summary.`,

  notConnected:
    "No AI assistant is connected to this workspace yet, so nothing can be saved.",
  notConnectedLink: "Set up the connection",
  notConnectedSuffix: ", then come back here.",

  progressHeading: "Progress",
  progressSaved: "Setup Summary saved to your workspace",
  progressSavedPending:
    "Nothing saved yet — this page updates when it's saved.",
  progressChecks: "Nothing missing from it",
  progressChecksDone: "Read it over whenever you're ready.",
  progressChecksPending: "Happens by itself once the document is saved.",
} as const;

// ── Running a module again ──────────────────────────────────────────────

export const retryCopy = {
  title: "Ready to go again",
  body: "Nothing more can be saved to this module until you start it again. Everything you've answered so far is kept.",
  cta: "Run it again",
  pending: "Opening…",
} as const;

// ── Module gates ────────────────────────────────────────────────────────

export const moduleGateCopy = {
  // No connection: Continue would fail — send them to connect instead.
  needsConnectionTitle: "Connect your AI assistant to start this module",
  needsConnectionBody:
    "Connect it once. It takes a couple of minutes, and this module opens as soon as you're done.",
  needsConnectionCta: "Connect it",

  needsRunTitle: "Open this module",
  needsRunBody: "Opens the module and gets your workspace ready for it.",
  needsRunCta: "Open module",

  // A Run already exists but has no row for this Module — its program
  // version postdates the one the Run was created against (e.g. new
  // Modules activated after the Founder's program started). "Open module"
  // would find the existing Run and return without creating anything, so
  // this gets its own honest copy instead of a button that does nothing.
  missingFromRunTitle: "This module isn't part of your program yet",
  missingFromRunBody:
    "This module was added after your program started, so your current program doesn't include it yet. Ask your program lead if you should have access to it.",

  setupPendingTitle: "Finish setting up your workspace",
  setupPendingBody:
    "One last setup step before this module opens. It takes a few seconds and you only do it once.",
  setupPendingCta: "Finish setup",

  lockedLead: "Locked for now.",
  lockedBody:
    "Each module builds on the one before it. Finish the previous module and this one opens automatically.",
  backToModules: "Back to modules",
} as const;

// ── Modules and artefacts ───────────────────────────────────────────────

// Same "raw idea → business case" framing as sign-in and /toolkit.
export const modulesCopy = {
  kicker: "The program",
  title: "From raw idea to a business case",
  // Locked modules look like paywalls without "open in order".
  intro:
    "Each module tests one part of your idea with your AI assistant and leaves a document in your workspace. They open in order.",
  allModules: "All modules",
  openCount: (open: number, total: number) => `${open} of ${total} open`,
} as const;

export const artefactsCopy = {
  kicker: "Your workspace",
  title: "Everything your modules produce",
  intro:
    "Every document your modules save is kept here, including each earlier version.",
  byModule: "By module",
  savedCount: (saved: number, total: number) => `${saved} of ${total} saved`,

  readCta: "Read document",
  // Trigger label for a menu that always offers more than one format
  // (Word is unconditional) — kept generic rather than naming one format.
  downloadCta: "Download",
  // Shown instead of downloadCta once a PDF renderer exists — the PDF
  // becomes the primary download, and the Markdown record moves to a
  // smaller secondary link beside it (operational-workbooks plan §11). Not
  // every renderer is a fillable form (Module 2's Ideal Customer Avatar is
  // a read-only styled export), so this stays generic.
  downloadWorkbookCta: "Download PDF",
  downloadSourceCta: "Download Markdown",
  startCta: "Start module",
  lockedCta: "Locked",
  storageNote: "Files are stored in your workspace, not just in the chat.",

  // Handoff cards — what a founder carries between two modules, rather than
  // what either module produces. Worded so the card explains its own place
  // in the sequence without a step number to lean on.
  interviewNotesTitle: "Interview notes",
  interviewNotesSubtitle:
    "The customer discovery interviews as you recorded them. Hand them to your assistant in whatever shape you have — a file, a doc, or pasted text — and what's kept here is formatted Markdown for Proof to grade.",

  interviewRecordsTitle: "Customer interviews",
  interviewRecordsSubtitle:
    "Record what customers said after Module 3. Complete all five interviews, submit them for review, then confirm evidence on Proof.",
  interviewRecordsCta: "Record interviews",
  interviewRecordsContinueCta: "Continue recording",
  interviewRecordsViewCta: "View interviews",
  interviewRecordsProgress: (completed: number, required: number) =>
    `${completed} of ${required} interviews completed`,
} as const;
