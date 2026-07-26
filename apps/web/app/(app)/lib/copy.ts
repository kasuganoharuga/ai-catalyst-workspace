// The Founder-facing words for onboarding, the connection flow, and
// Module 1 — the surfaces a new founder meets before anything else.
//
// Centralised so tone can be reviewed in one sitting instead of being
// reverse-engineered from twenty components. Artefacts, workspace and
// profile copy are deliberately still inline; they are not on the
// first-run path and folding them in now would bury the change.
//
// House style, applied throughout:
//   - One idea per sentence. Full stop, not a dash.
//   - No metaphors. Say what happens, not what it feels like.
//   - Start an instruction with its verb.
//   - Australian English throughout: "program" (not programme),
//     "artefact", "authorise"/"organise" (-ise, not -ize), "-our" endings.
//     Note the two that look inconsistent but aren't: Australian English
//     takes the American "program" and the British "artefact". OAuth wire
//     values (`authorization_code`, `authorization_endpoint`) stay as the
//     spec spells them — those are protocol identifiers, not copy.
//
// Module titles, subtitles, descriptions and the six question texts are
// NOT here — those live in the database, seeded from
// packages/services/src/content-seed/content. Changing them means editing
// the seed content and bumping the program version.

// ── Connection ──────────────────────────────────────────────────────────

export interface ManualStep {
  title: string;
  body: string;
  /** Only the first step links out to Claude's settings. */
  linkLabel?: string;
  /**
   * Renders the workspace address, with its copy button, inside this step.
   * Exactly one step sets it: the address belongs at the moment it is
   * needed, not in a panel above that the step then has to point back at.
   */
  showAddress?: boolean;
  /** Tagged in the UI so it reads as a nicety, not a missed requirement. */
  optional?: boolean;
}

export const connectionCopy = {
  kicker: "Setup",
  title: "Connect Claude",
  intro:
    "You work through each module by talking to Claude. Connecting lets Claude read the module questions and save your answers back here. You only do this once.",

  addressHeading: "Your workspace address",
  // Never name the environment variable. A founder can't act on it, and a
  // missing deployment setting is their program lead's problem, not theirs.
  addressMissing:
    "This workspace isn't set up for connections yet. Contact your program lead.",

  expiredTitle: "Your connection expired",
  expiredBody:
    "Your saved work is safe. Reconnect in Claude using the same address below.",

  // The manual steps lead, and the "have Claude walk you through it" route
  // is the disclosure behind them.
  //
  // The two were the other way round until it became clear what Claude can
  // actually do here: it cannot open its own settings, cannot click
  // anything, and cannot see whether the connector ended up connected. It
  // narrates. That is worth having when a screen doesn't match, but it is
  // not worth being the headline — especially since the most common reason
  // a founder gets stuck (see troubleshooting) is a plan restriction that
  // no amount of narration will fix.
  setupTitle: "Add the connector in Claude",
  setupBody: "Six steps, once. You'll approve access at the end.",
  setupPromptLabel: "Message to send",
  setupOpenCta: "Open Claude",

  manualSteps: [
    {
      title: "Open Settings in Claude",
      body: "Click your avatar in the bottom-left corner, then choose Settings.",
      linkLabel: "Open settings",
    },
    { title: "Go to Connectors", body: "It's in the settings sidebar." },
    {
      title: 'Click Add, then "Add custom connector"',
      body: "The Add button sits at the top of the connectors list.",
    },
    {
      title: "Name it and paste this address",
      body: 'Call it anything — "AI Catalyst" works.',
      showAddress: true,
    },
    {
      title: "Approve access",
      body: "Claude shows a link that opens your browser. Sign in there and approve.",
    },
    {
      title: "Allow the tools",
      body: "Saves Claude asking permission every time it writes to your workspace.",
      optional: true,
    },
  ] as ManualStep[],

  claudeHelpSummary: "Rather have Claude walk you through it?",
  claudeHelpBody:
    "This opens Claude with the steps already written. You still do the clicking — Claude can't reach its own settings — but it can sort you out if a screen doesn't look like it should.",

  // Every one of these is a wall a founder actually hit. The first two are
  // plan restrictions, which is why no rewording of the steps above would
  // have helped: the option genuinely isn't there to find.
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
    {
      symptom: "You approved access, but this page hasn't moved",
      fix: "Come back to this tab and leave it open for a few seconds. It checks while you're looking at it.",
    },
  ],

  // Shown while the page polls for authorisation. The founder is in Claude
  // at this point, so this has to make sense on the tab they left behind.
  waitingTitle: "Waiting for Claude",
  waitingBody:
    "Leave this page open. Your first module opens automatically once Claude is connected.",
  connectedTitle: "Claude is connected",
  connectedBody: "Opening your first module.",
  watchRetry: "Try again",

  statusHeading: "Connection status",
  statusClient: "Authorised client",
  statusValidUntil: "Authorisation valid until",
  statusLastActivity: "Last activity from Claude",
  statusNeverUsed: "Never used yet",
  statusActiveNote:
    "Claude called your workspace in the last few minutes, so the connection is working.",
  statusNeverUsedNote:
    "Claude is authorised but hasn't called your workspace yet. Your first module will be the first thing that does.",
  statusIdleNote:
    "Nothing recent to go on. Claude may simply be closed. Ask it to do anything in your workspace, then refresh.",

  privacyLabel: "What this connection does:",
  privacyBody:
    "Claude can read module questions, save your answers, and store the documents you produce. We cannot see your Claude conversations. Every call is logged, and you can disconnect from Claude's settings at any time.",
} as const;

// ── Opening Claude ──────────────────────────────────────────────────────

export const claudeHandoffCopy = {
  promptLabel: "Send this",
  copyLabel: "Copy",
  openCta: "Continue in Claude",
  retryCta: "Retry in Claude",
  // The desktop deep link is the primary route, and a `claude://` link does
  // nothing visible when the app isn't installed — no error, no new tab.
  // That silence is the single most likely thing to read as "the site is
  // broken", so the fallback is phrased as a symptom, not as an option.
  desktopHint: "Opens the Claude desktop app with your message ready to send.",
  browserFallbackPrefix: "Nothing happened?",
  browserFallbackLink: "Open in your browser",
} as const;

// ── Dashboard ───────────────────────────────────────────────────────────

export const dashboardCopy = {
  // A brand-new account has never been here, so "Welcome back" is simply
  // untrue on the one visit where first impressions are set.
  greetingFirstVisit: (name: string) => `Welcome ${name}`,
  greetingReturning: (name: string) => `Welcome back, ${name}`,

  // Deliberately nothing under the greeting on a first visit: the card
  // below already says what to do, and a second sentence saying it again
  // in different words is the first thing a new founder has to skip.
  subNeedsConnection: "Connect Claude once. That's the only setup step.",
  subNeedsRun: "Your program is ready to open.",
  subInProgress: "Module 1 is open. Work through it with Claude.",
  subDone: "Module 1 is done. Your verdict is saved.",

  actionFirstKicker: "First",
  actionProfileTitle: "Set up your profile",
  actionProfileBody: "Allow 30 seconds.",
  actionProfileCta: "Start now",
  actionProfileSkip: "Skip for now",

  actionConnectTitle: "Connect Claude",
  actionConnectBody:
    "One connection links Claude to this workspace. It takes about two minutes.",
  actionConnectCta: "Connect Claude",

  actionOpenRunTitle: "Open your program",
  actionOpenRunBody:
    "This sets up your run and takes you to your first module.",
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
  workBodyLocked:
    "A preview of how this module works. Actions open once you finish the module before it.",
  workLockedNote:
    "Opening Claude and starting this module unlocks after you finish the previous one.",

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
  progressChecks: "Passed its checks",
  progressChecksDone: "Ready for you to look over.",
  progressChecksPending: "Runs automatically once the verdict is saved.",

  confirmTitle: "Read it over, then confirm",
  confirmBody:
    "Your verdict is saved and passed its checks. Confirming marks this module done. Proceed, pivot and kill all complete it, and the next module opens either way.",
  confirmNoFileTitle: "No file yet",
  confirmNoFileBody:
    "We haven't found a verdict in your workspace yet. Once Claude saves it and it passes its checks, you sign it off here.",
  confirmNoFileLocked:
    "You can look ahead here. Starting an attempt and saving a verdict open once this module does.",
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

// Proceed, pivot and kill all complete Module 1 — the difference is only in
// what the founder is told happens next, so all three read as a finished
// piece of work rather than as a success and two consolation prizes.
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

// ── Modules and artefacts ───────────────────────────────────────────────

// Both of these pages are lists. A founder arrives already knowing what
// they came for, so the header's job is to label the page, not to explain
// the product to someone who has already bought it.
export const modulesCopy = {
  kicker: "The program",
  title: "Every module, in order",
  // Was two sentences ending "already on the table for the next" — a
  // metaphor doing the work a plain verb does better.
  intro:
    "Work through each one in Claude. They open in order, and each builds on the one before.",
  allModules: "All modules",
  openCount: (open: number, total: number) => `${open} of ${total} open`,
} as const;

export const artefactsCopy = {
  kicker: "Your workspace",
  title: "Everything your modules produce",
  // Was "They live here — versioned, checked, and ready whenever you come
  // back": a three-adjective list where two of the three were the point.
  intro: "Every document Claude saves is kept here, versioned and checked.",
  byModule: "By module",
  savedCount: (saved: number, total: number) => `${saved} of ${total} saved`,
  empty: "Nothing here yet. Module 1 saves your first document.",
  emptyCta: "Go to modules",
  storageNote: "Files are stored in your workspace, not just in the chat.",
} as const;

// ── Workspace ───────────────────────────────────────────────────────────

// "Venture" is the word the database uses. Founders have an idea, and a
// product that has to define its own noun for them ("A Venture is an idea
// you're currently validating") has picked the wrong noun.
export const workspaceCopy = {
  kicker: "Workspace",
  intro: "Your ideas. Create one, and switch between them any time.",
  empty: "No ideas yet.",
  inactiveNotice: (status: string) =>
    `This workspace is ${status.toLowerCase()}, so ideas can't be changed right now.`,
  createIdea: "Add an idea",
  creatingIdea: "Adding…",
} as const;

// Raw column values were being printed straight to the screen, so a
// founder could be shown "company_formed" — underscore and all.
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

// Every one of these names what happened and what to do next. None of them
// blame the founder for a state they did not choose.
export const errorCopy = {
  generic: "That didn't work. Try again in a moment.",
  notConnected:
    "Claude isn't connected yet. Finish approving access in Claude, then try again.",
  noActiveVenture:
    "We couldn't find your active program. Open the dashboard and try again, or ask your program lead.",
  ventureUnavailable:
    "Your program workspace isn't available. Open the dashboard, or ask your program lead.",
  setupFailed:
    "Claude is connected, but the workspace check didn't pass. Try again in a moment, and tell your program lead if it keeps happening.",
  copyFailed: "Couldn't copy. Select the text and copy it manually.",
} as const;

// ── Toasts ──────────────────────────────────────────────────────────────

// Toasts are for things that happened and are over: a save that failed, a
// copy that worked. They are the wrong shape for a state the founder is
// stuck in — those stay on the page, where they can't be missed or
// dismissed by a timer.
export const toastCopy = {
  moduleConfirmed: "Module confirmed",
  moduleConfirmedNext: (nextModuleTitle: string) =>
    `${nextModuleTitle} is now open.`,
  actionFailedTitle: "That didn't work",
} as const;

// ── Profile prompt ──────────────────────────────────────────────────────

// Filling in a profile is not a prerequisite for anything: the toolkit
// works perfectly well addressing someone by their invitation name, and
// making it step one of onboarding put a form between a founder and the
// only thing they came to do. It is a nudge on the dashboard instead, and
// it disappears the moment the name is saved.
export const profilePromptCopy = {
  title: "Add your name",
  // The password is mentioned here rather than nagged about separately:
  // Better Auth gives us no way to tell whether the invitation password
  // has been replaced, so a dedicated prompt could never turn itself off.
  body: "The toolkit uses it to address you. While you're there you can also replace your invitation password.",
  cta: "Go to profile",
} as const;
