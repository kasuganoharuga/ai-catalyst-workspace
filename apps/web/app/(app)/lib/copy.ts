// Founder-facing copy: onboarding, connection, modules, workspace, profile, errors.
// Australian English: program, artefact, authorise (-ise). OAuth wire values stay as the spec spells them.
// Module titles, subtitles, and question texts live in the DB (content-seed), not here.

// ── Connection ──────────────────────────────────────────────────────────

export interface ManualStep {
  title: string;
  body: string;
  /** Only the first step links out to Claude's settings. */
  linkLabel?: string;
  /** Renders the workspace address (with copy button) in this step. */
  showAddress?: boolean;
  /** Tagged in the UI as optional, not a missed requirement. */
  optional?: boolean;
  /** Schematic beside this step (not a Claude screenshot — their UI moves). */
  illustration?: StepIllustrationKey;
}

/** Keys into STEP_ILLUSTRATIONS in connection/components/step-illustrations. */
export type StepIllustrationKey =
  "connectors" | "add-connector" | "paste-address" | "approve" | "allow-tools";

export const connectionCopy = {
  kicker: "Setup",
  title: "Connect Claude",
  // Connected state: header must not still read as setup instructions.
  kickerConnected: "Your account",
  titleConnected: "Claude connection",
  // Two intros: disconnected vs already-connected audiences.
  intro:
    "Connect Claude once. It takes about two minutes, and your first module opens as soon as you're done.",
  introConnected:
    "Claude is connected to this workspace. Everything below is here if you want to check on it or end access.",

  addressHeading: "Your workspace address",
  // Never name the env var — a founder can't act on it.
  addressMissing:
    "This workspace isn't set up for connections yet. Contact your program lead.",

  expiredTitle: "Your connection expired",
  expiredBody:
    "Your saved work is safe. Reconnect in Claude using the same address below.",

  setupTitle: "Add the connector in Claude",
  setupBody: "Five steps, once. You'll approve access at the end.",
  setupPromptLabel: "Message to send",
  setupOpenCta: "Open Claude",

  // No menu route — Claude moved connectors; link goes straight to the page.
  manualSteps: [
    {
      title: "Open your connectors in Claude",
      body: "They live under Customize.",
      linkLabel: "Open connectors in the Claude app",
      illustration: "connectors",
    },
    {
      title: "Add a custom connector",
      body: "Use the Add button on that page and choose the custom option.",
      illustration: "add-connector",
    },
    {
      title: "Name it and paste this address",
      // Advanced OAuth fields look required; server registers the client.
      body: 'Call it anything — "AI Catalyst" works. Leave the two advanced fields empty.',
      showAddress: true,
      illustration: "paste-address",
    },
    {
      title: "Approve access",
      body: "Claude shows a link that opens your browser. Sign in there and approve.",
      illustration: "approve",
    },
    {
      title: "Allow the tools",
      body: "Saves Claude asking permission every time it writes to your workspace.",
      optional: true,
      illustration: "allow-tools",
    },
  ] as ManualStep[],

  settingsFallbackPrefix: "Nothing happened?",
  settingsFallbackLink: "Open connectors in your browser",

  claudeHelpSummary: "Rather have Claude walk you through it?",
  claudeHelpBody:
    "This opens Claude with the steps already written. You still do the clicking, but Claude can help if a screen doesn't look like it should.",

  troubleshootingTitle: "If something doesn't look right",
  troubleshooting: [
    {
      symptom: `There's no "Add custom connector" option`,
      fix: "Custom connectors need a paid Claude plan. They don't appear on the Free plan.",
    },
    {
      symptom: "You're on a Team or Enterprise plan",
      fix: "Only the workspace owner can add a connector. Ask them to add it once, and it appears for everyone.",
    },
    // Claude moved connectors to Customize — link beats menu navigation.
    {
      symptom: "Claude's screens don't match these steps",
      fix: "Claude moves this page from time to time — it currently sits under Customize. Use the link above rather than navigating by menu.",
    },
    {
      symptom: "You approved access, but this page hasn't moved",
      fix: "Come back to this tab and leave it open for a few seconds. It checks while you're looking at it.",
    },
  ],

  waitingTitle: "Waiting for Claude",
  waitingBody:
    "Leave this page open. Your first module opens automatically once Claude is connected.",
  connectedTitle: "Claude is connected",
  connectedBody: "Opening your first module.",
  watchRetry: "Try again",

  // Disconnect here ends server access; removing the connector in Claude does not.
  disconnectTitle: "Disconnect Claude",
  disconnectBody:
    "Ends Claude's access to this workspace. The connector stays in your Claude settings, and reconnecting means approving access again.",
  disconnectCta: "Disconnect",
  disconnectPending: "Disconnecting…",
  disconnectDone: "Claude no longer has access to this workspace.",

  statusHeading: "Connection status",
  statusClient: "Connected to",
  // Lapse date if unused — connection renews when Claude uses it.
  statusValidUntil: "Stays connected until",
  statusLastActivity: "Claude last used it",
  statusNeverUsed: "Not yet",
  statusActiveNote:
    "Claude used your workspace in the last few minutes, so everything is working.",
  statusNeverUsedNote:
    "Claude has access but hasn't used it yet. Your first module will be the first thing that does.",
  statusIdleNote:
    "Claude hasn't used your workspace recently, which usually just means it's closed. Ask it to do something here, then refresh.",

  privacyLabel: "What this connection does:",
  // End access on this page — removing the connector in Claude has no effect here.
  privacyBody:
    "Claude can read module questions, save your answers, and store the documents you produce. We cannot see your Claude conversations. Everything Claude does here is recorded, and you can end access from this page at any time.",
} as const;

// ── Opening Claude ──────────────────────────────────────────────────────

export const claudeHandoffCopy = {
  promptLabel: "Send this",
  copyLabel: "Copy",
  openCta: "Continue in Claude",
  retryCta: "Retry in Claude",
  // claude:// does nothing visible without the desktop app — phrase fallback as a symptom.
  desktopHint: "Opens the Claude desktop app with your message ready to send.",
  browserFallbackPrefix: "Nothing happened?",
  browserFallbackLink: "Open in your browser",
} as const;

// ── Dashboard ───────────────────────────────────────────────────────────

export const dashboardCopy = {
  // First visit: "Welcome back" is untrue before they've been here.
  greetingFirstVisit: (name: string) => `Welcome ${name}`,
  greetingReturning: (name: string) => `Welcome back, ${name}`,

  subNeedsConnection: "Connect Claude once. That's the only setup step.",
  subNeedsRun: "Your program is ready to open.",
  subInProgress: "Module 1 is open. Work through it with Claude.",
  subDone: "Module 1 is done. Your verdict is saved.",

  actionFirstKicker: "First",
  actionProfileTitle: "Set up your profile",
  actionProfileBody: "Allow 30 seconds.",
  actionProfileCta: "Start now",
  actionProfileSkip: "Skip for now",

  // Separate from profile card — disappears once password is changed, no skip.
  passwordPromptTitle: "You're still using your invitation password",
  passwordPromptBody: "For security, replace it with one of your own.",
  passwordPromptCta: "Change it",

  actionConnectTitle: "Connect Claude",
  actionConnectBody:
    "One connection links Claude to this workspace. It takes about two minutes.",
  actionConnectCta: "Connect Claude",

  actionOpenRunTitle: "Open your program",
  actionOpenRunBody: "Takes you straight to your first module.",
  actionOpenRunCta: "Open program",

  actionModule1Title: "Start Module 1",
  actionModule1Body:
    "Claude asks six questions about your idea, then you decide: proceed, pivot or kill.",
  actionModule1Cta: "Open Module 1",

  actionDoneTitle: "Module 1 is complete",
  actionDoneBody: "Your verdict is saved and versioned in your artefacts.",
  actionDoneCta: "View artefacts",

  statModules: "Modules unlocked",
  statArtefacts: "Artefacts saved",
  modulesHeading: "Your modules",
  modulesViewAll: "View all",
} as const;

// ── Module 1 ────────────────────────────────────────────────────────────

export const module1Copy = {
  stepBrief: "What this is",
  stepWork: "Work through it",
  stepConfirm: "Confirm and unlock",

  briefTitle: "What this module is for",
  briefBody:
    "Claude plays a veteran investor and challenges your idea. You'll cover where it breaks, who you're really competing with, and what would have to be true for it to work. You finish with a decision you can defend: proceed, pivot or kill.",

  whyHeading: "Why it matters",
  whyBody:
    "Most ideas fail because nobody asked the hard questions early enough. By the time the market answers them, a year and a lot of money are gone. This is the cheap version of that conversation.",
  whyBuildsOn: (moduleIndex: string) =>
    `Every module after Module ${moduleIndex} builds on the verdict you write here. Vague answers now cost you in each one.`,

  beforeHeading: "Before you start",
  before: [
    {
      lead: "Set aside 30–45 minutes.",
      body: "Half-answers produce a verdict you can't use.",
    },
    {
      lead: "Be specific, not polished.",
      body: '"Founders who\'ve cold-emailed 50 investors and stalled" beats "early-stage startups". Rough wording is fine.',
    },
    {
      lead: "Expect pushback.",
      body: "Claude will name the strongest case against your idea and challenge vague answers. That is intentional.",
    },
    {
      lead: "This doesn't replace talking to customers.",
      body: "Anything without a real conversation behind it is recorded as an assumption, not evidence.",
    },
  ],

  workTitle: "Work through it in Claude",
  workBody:
    "Send the message below. Claude asks the questions one at a time. This page updates as it saves, so you can leave and come back.",
  // Locked vs not-started need different copy — connection and prior-module gates differ.
  workBodyLocked:
    "A preview of how this module works. You can start it once you finish the module before it.",
  workBodyNotStarted:
    "A preview of how this module works. The steps go live once Claude is connected.",
  workLockedNote:
    "Opening Claude and starting this module unlocks after you finish the previous one.",
  workNotStartedNote:
    "Connect Claude first. This message then opens a chat that starts the module.",

  notConnected:
    "Claude isn't connected to this workspace yet, so nothing can be saved.",
  notConnectedLink: "Connect Claude",
  notConnectedSuffix: ", then come back.",

  questionsLabel: "Six pressure-test questions",
  questionsCount: (answered: number, total: number) =>
    `${answered} / ${total} answered`,

  progressDecision: "Proceed, pivot or kill recorded",
  progressDecisionDone: "Your decision is saved.",
  progressDecisionPending: "Comes after the verdict.",
  progressVerdict: "Verdict saved to your workspace",
  progressVerdictPending: "Nothing saved yet.",
  progressChecks: "Nothing missing from it",
  progressChecksDone: "Read it over whenever you're ready.",
  progressChecksPending: "Happens by itself once your verdict is saved.",

  confirmTitle: "Read it over, then confirm",
  confirmBody:
    "Your verdict is saved and nothing is missing from it. Confirming marks this module done. Proceed, pivot and kill all complete it, and the next module opens either way.",
  confirmNoFileTitle: "No file yet",
  confirmNoFileBody:
    "We haven't found a verdict in your workspace yet. Once Claude saves it, you sign it off here.",
  confirmNoFileLocked:
    "You can look ahead here. You'll be able to start this module and save a verdict once the one before it is done.",
  confirmNoFileNotStarted:
    "You can look ahead here. Sign-off appears once Claude has saved your verdict.",
  confirmUnavailable: "Sign-off opens along with this module.",
  confirmFinishFirst: "Finish the conversation in the previous step first.",
  reviseHint:
    "Not happy with it? Ask Claude to revise. Nothing is locked in until you confirm.",

  documentHeading: "The document",
  documentCovers: "It should cover",
  documentRead: "Read document",
  documentDownload: "Download",
  documentDecisionLabel: "Your decision",
  documentNotSaved: "Not saved yet.",
  backToIdeas: "Back to your ideas",
  documentExpand: "Show the rest",
  documentCollapse: "Show less",
  documentOpenFull: "Open full page",
  documentMeta: (version: number, savedAt: string | null) =>
    savedAt ? `Version ${version} · ${savedAt}` : `Version ${version}`,
} as const;

// Proceed, pivot and kill all complete Module 1 — wording differs by what happens next.
export type FounderDecision = "proceed" | "pivot" | "kill";

export function module1CompletedTitle(decision: FounderDecision): string {
  if (decision === "kill") return "Signed off. This idea is parked.";
  if (decision === "pivot") return "Signed off. Revised direction recorded.";
  return "Signed off. The next module is open.";
}

export function module1CompletedBody(
  decision: FounderDecision,
  nextModuleTitle: string | null,
): string {
  if (decision === "kill") {
    return nextModuleTitle
      ? `You chose kill. This module is complete. Return to your venture, start a new one, or continue to ${nextModuleTitle} if you still want to explore.`
      : "You chose kill. This module is complete. Return to your venture, or start a new one.";
  }
  if (decision === "pivot") {
    return nextModuleTitle
      ? `You chose pivot. ${nextModuleTitle} is open if you want to continue with the revised framing. You can also re-run this module with Claude first.`
      : "You chose pivot. Re-run this module with Claude for a fresh pressure-test on the revised idea.";
  }
  return nextModuleTitle
    ? `You confirmed this, which opened ${nextModuleTitle}. Your verdict stays in your workspace.`
    : "You confirmed this. Your verdict stays in your workspace.";
}

export function module1ConfirmCta(decision: FounderDecision): string {
  if (decision === "kill") return "Confirm completion";
  if (decision === "pivot") return "Confirm and continue";
  return "Confirm and open the next module";
}

// ── Running a module again ──────────────────────────────────────────────

export const retryCopy = {
  title: "Ready to go again",
  body: "Claude can't save anything more to this module until you start it again. Everything you've answered so far is kept.",
  cta: "Run it again",
  pending: "Opening…",
} as const;

// ── Module gates ────────────────────────────────────────────────────────

export const moduleGateCopy = {
  // No connection: Continue would fail — send them to connect instead.
  needsConnectionTitle: "Connect Claude to start this module",
  needsConnectionBody:
    "Connect Claude once. It takes about two minutes, and this module opens as soon as you're done.",
  needsConnectionCta: "Connect Claude",

  needsRunTitle: "Open this module",
  needsRunBody: "Opens the module and gets your workspace ready for it.",
  needsRunCta: "Open module",

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
    "Each module tests one part of your idea with Claude and leaves a document in your workspace. They open in order.",
  allModules: "All modules",
  openCount: (open: number, total: number) => `${open} of ${total} open`,
} as const;

export const artefactsCopy = {
  kicker: "Your workspace",
  title: "Everything your modules produce",
  intro:
    "Every document Claude saves is kept here, including each earlier version.",
  byModule: "By module",
  savedCount: (saved: number, total: number) => `${saved} of ${total} saved`,

  readCta: "Read document",
  downloadCta: "Download",
  startCta: "Start module",
  lockedCta: "Locked",
  storageNote: "Files are stored in your workspace, not just in the chat.",
} as const;

// ── Workspace ───────────────────────────────────────────────────────────

// DB uses "venture"; founders have ideas — avoid defining a new noun.
export const workspaceCopy = {
  kicker: "Workspace",
  intro: "Your ideas. Create one, and switch between them any time.",
  empty: "No ideas yet.",
  inactiveNotice: (status: string) =>
    `This workspace is ${status.toLowerCase()}, so ideas can't be changed right now.`,
  createIdea: "Add an idea",
  creatingIdea: "Adding…",
} as const;

// Raw column values were printing with underscores (e.g. company_formed).
const VENTURE_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  abandoned: "Abandoned",
  archived: "Archived",
};

const LIFECYCLE_STAGE_LABEL: Record<string, string> = {
  idea: "Idea",
  validating: "Validating",
  validated: "Validated",
  company_formed: "Company formed",
};

/** Falls back to the raw value rather than hiding an unknown state. */
export function ventureStatusLabel(status: string): string {
  return VENTURE_STATUS_LABEL[status] ?? status;
}

export function lifecycleStageLabel(stage: string): string {
  return LIFECYCLE_STAGE_LABEL[stage] ?? stage;
}

// ── Errors ──────────────────────────────────────────────────────────────

export const errorCopy = {
  generic: "That didn't work. Try again in a moment.",
  notConnected:
    "Claude isn't connected yet. Finish approving access in Claude, then try again.",
  noActiveVenture:
    "We couldn't find your active program. Open the dashboard and try again, or ask your program lead.",
  ventureUnavailable:
    "Your program workspace isn't available. Open the dashboard, or ask your program lead.",
  setupFailed:
    "Claude is connected, but setting up your workspace didn't finish. Try again in a moment, and tell your program lead if it keeps happening.",
  copyFailed: "Couldn't copy. Select the text and copy it manually.",
} as const;

// ── Toasts ──────────────────────────────────────────────────────────────

// Toasts for transient outcomes — stuck states stay on the page.
export const toastCopy = {
  moduleConfirmed: "Module confirmed",
  moduleConfirmedNext: (nextModuleTitle: string) =>
    `${nextModuleTitle} is now open.`,
  actionFailedTitle: "That didn't work",
} as const;

// ── Profile prompt ──────────────────────────────────────────────────────

// Nudge on dashboard, not a gate — disappears once name is saved.
export const profilePromptCopy = {
  title: "Add your name",
  body: "So we can address you by name instead of your email address.",
  cta: "Go to profile",
} as const;
