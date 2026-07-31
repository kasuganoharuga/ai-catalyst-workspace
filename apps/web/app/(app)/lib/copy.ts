// The Founder-facing words for onboarding, the connection flow, and
// Module 1 — the surfaces a new founder meets before anything else.
//
// Centralised so tone can be reviewed in one sitting instead of being
// reverse-engineered from twenty components. Artefacts, workspace, module
// gates and profile copy have since moved in here too; what is still inline
// is per-component labels that only make sense next to the control they
// belong to.
//
// House style, applied throughout:
//   - One idea per sentence. Full stop, not a dash.
//   - No metaphors. Say what happens, not what it feels like.
//   - Start an instruction with its verb.
//   - Never name an internal concept the founder cannot see or act on.
//     "Your run", "an attempt", "the workspace check", "authorised client",
//     "passed its checks" and "the toolkit" all shipped at some point and
//     all had to be rewritten: each named a table, a protocol term or the
//     product itself where the founder needed an outcome. Say what they
//     get, not what the system does to get it.
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
  /**
   * Schematic beside this step (not a Claude screenshot — their UI moves;
   * a stale photo is worse than a rough diagram).
   */
  illustration?: StepIllustrationKey;
}

/** Keys into STEP_ILLUSTRATIONS in connection/components/step-illustrations. */
export type StepIllustrationKey =
  "connectors" | "add-connector" | "paste-address" | "approve" | "allow-tools";

export const connectionCopy = {
  kicker: "Setup",
  title: "Connect Claude",
  // Once connected this stops being a setup page and becomes the place you
  // come to check on or end the connection. Leaving the header as
  // "Setup / Connect Claude" told a founder to do the thing they had
  // already done.
  kickerConnected: "Your account",
  titleConnected: "Claude connection",
  // Three sentences explaining the mechanism before ever saying what it
  // costs or what comes next. A founder on this page has already decided to
  // connect — what they want to know is how long it takes and what happens
  // after, so that is what this says now.
  //
  // Two versions, because this page has two audiences. Telling someone who
  // is already connected to "connect Claude once" reads as though the thing
  // they just finished did not take.
  intro:
    "Connect Claude once. It takes about two minutes, and your first module opens as soon as you're done.",
  introConnected:
    "Claude is connected to this workspace. Everything below is here if you want to check on it or end access.",

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
  setupBody: "Five steps, once. You'll approve access at the end.",
  setupPromptLabel: "Message to send",
  setupOpenCta: "Open Claude",

  // Deliberately no menu route. Naming each click — avatar, Settings,
  // Connectors — was accurate until Claude moved connectors under
  // Customize, at which point every founder following these steps hit a
  // screen that did not exist and had no way to tell a moved menu from a
  // missing feature. The link goes straight to the page instead, and the
  // steps describe what to do once there.
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
      // Advanced OAuth fields look required; the server registers the client.
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
  // Sets the expectation without dwelling on the limitation. The version
  // before this spent its middle clause explaining what Claude cannot do,
  // which is our problem to know and not the founder's to read about.
  claudeHelpBody:
    "This opens Claude with the steps already written. You still do the clicking, but Claude can help if a screen doesn't look like it should.",

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
    // Added after Claude moved connectors out of Settings and into
    // Customize. The steps above no longer name a menu route for exactly
    // this reason, but a founder who navigates by memory can still land on
    // the old screen and read "moved" as "missing".
    {
      symptom: "Claude's screens don't match these steps",
      fix: "Claude moves this page from time to time — it currently sits under Customize. Use the link above rather than navigating by menu.",
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

  // Says what it does and what it doesn't. Removing the connector inside
  // Claude never reached this server, so a founder could have "connected"
  // on one screen and "disconnected" on the other; this is the button that
  // makes them agree. It does not remove the connector from Claude — being
  // vague about that would leave someone thinking they were done.
  disconnectTitle: "Disconnect Claude",
  disconnectBody:
    "Ends Claude's access to this workspace. The connector stays in your Claude settings, and reconnecting means approving access again.",
  disconnectCta: "Disconnect",
  disconnectPending: "Disconnecting…",
  disconnectDone: "Claude no longer has access to this workspace.",

  // These labels used to read like an OAuth console — "Authorised client",
  // "Authorisation valid until", "Claude called your workspace". Every one
  // of them named a protocol concept rather than the thing a founder came
  // to this panel to find out: is it connected, until when, and has it done
  // anything.
  statusHeading: "Connection status",
  statusClient: "Connected to",
  // Stays honest about what the date means. The connection renews itself
  // every time Claude uses it, so this is the date it would lapse if the
  // founder never touched it again — not a countdown they need to watch.
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
  // Was "you can disconnect from Claude's settings at any time" — which
  // named the one place that has no effect here. Removing the connector in
  // Claude is client-side; ending access is done on this page.
  privacyBody:
    "Claude can read module questions, save your answers, and store the documents you produce. We cannot see your Claude conversations. Everything Claude does here is recorded, and you can end access from this page at any time.",
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

  // Its own prompt, not a clause inside the profile card. Bundled there,
  // it vanished the moment a founder saved their name — so the one
  // account most likely to still be on an emailed password was the one
  // that never heard about it again. No skip: unlike a name, this has a
  // real end state and disappears by itself once the password changes.
  //
  // Says what to do, not what could go wrong. The body used to spell out
  // the threat model ("treat it as known to anyone who has seen that
  // inbox"), which lectures a founder about a risk they did not create and
  // still leaves them to work out the action for themselves.
  passwordPromptTitle: "You're still using your invitation password",
  passwordPromptBody: "For security, replace it with one of your own.",
  passwordPromptCta: "Change it",

  actionConnectTitle: "Connect Claude",
  actionConnectBody:
    "One connection links Claude to this workspace. It takes about two minutes.",
  actionConnectCta: "Connect Claude",

  actionOpenRunTitle: "Open your program",
  // "Sets up your run" was the `program_runs` table talking. A founder has
  // never heard the word "run" and cannot tell whether it is something they
  // are supposed to have done already.
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
  // Two ways to be looking at this module without being able to work on
  // it, and they need different sentences: one is waiting on the module
  // before it, the other on a connection. Telling a founder to "finish the
  // previous module" when what they actually need is to connect Claude
  // sends them looking for a module that isn't the problem.
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
  // "Passed its checks" described our validation step. A founder does not
  // know what the checks are, cannot run them, and cannot fail them — what
  // they need to know is whether the document is complete enough to sign.
  progressChecks: "Nothing missing from it",
  progressChecksDone: "Read it over whenever you're ready.",
  progressChecksPending: "Happens by itself once your verdict is saved.",

  confirmTitle: "Read it over, then confirm",
  confirmBody:
    "Your verdict is saved and nothing is missing from it. Confirming marks this module done. Proceed, pivot and kill all complete it, and the next module opens either way.",
  confirmNoFileTitle: "No file yet",
  confirmNoFileBody:
    "We haven't found a verdict in your workspace yet. Once Claude saves it, you sign it off here.",
  // Was "Starting an attempt and saving a verdict open once this module
  // does" — `module_attempts` leaking into a sentence a founder reads.
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

// ── Running a module again ──────────────────────────────────────────────

// Shown when a module still reads as in progress but Claude has no open
// attempt to write into (typically after a failed validation). Centralised
// because the same button label was declared in three separate components.
//
// None of this says "attempt" or "pass" any more. Both are `module_attempts`
// showing through: a founder has no way to see an attempt, did not know one
// was open, and cannot tell what closing one means. What they can act on is
// that Claude has stopped being able to save, and that starting the module
// again fixes it without losing anything.
export const retryCopy = {
  title: "Ready to go again",
  body: "Claude can't save anything more to this module until you start it again. Everything you've answered so far is kept.",
  cta: "Run it again",
  pending: "Opening…",
} as const;

// ── Module gates ────────────────────────────────────────────────────────

// What a founder sees on a module page before that module can be worked
// on. Each of these is a different reason, and each names the one action
// that resolves it — a single "Continue" for all of them was how someone
// with no connection ended up clicking a button that could only fail.
export const moduleGateCopy = {
  // The case that was broken: no connection, so the Continue button had
  // nothing it could do. It called the action anyway and returned an
  // error toast, which reads as the site being broken rather than as a
  // step not done yet.
  needsConnectionTitle: "Connect Claude to start this module",
  needsConnectionBody:
    "Connect Claude once. It takes about two minutes, and this module opens as soon as you're done.",
  needsConnectionCta: "Connect Claude",

  // Connected, but no Run exists yet. Here the button genuinely works.
  needsRunTitle: "Open this module",
  needsRunBody: "Opens the module and gets your workspace ready for it.",
  needsRunCta: "Open module",

  // Was "One check has to run against your workspace" — the founder is not
  // running anything, has no idea what the check is, and cannot influence
  // whether it passes. All they need is that it is quick and one-off.
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

// Both of these pages are lists a founder comes back to repeatedly, so the
// header names the outcome as a plain fact rather than promising it. Two
// wrong versions to steer between: "Every module, in order" described the
// shelf the modules sit on and told a returning founder nothing, while
// "Come out with an idea you can defend" was a launch-page slogan sitting
// on a utility page — fine once, tiresome by the fiftieth visit, and it
// restated what the cards directly below already showed.
//
// "From raw idea to a business case" is deliberately the same framing the
// sign-in panel ("takes a raw idea apart and rebuilds it into a business
// case") and /toolkit ("Move from raw idea to validation-ready plan")
// already use, so all three describe the program the same way.
export const modulesCopy = {
  kicker: "The program",
  title: "From raw idea to a business case",
  // "They open in order" earned its place back after being cut for reading
  // as mechanics: the list below is mostly COMING SOON badges, and without
  // this a founder can read a locked module as broken or paywalled rather
  // than simply not reached yet.
  intro:
    "Each module tests one part of your idea with Claude and leaves a document in your workspace. They open in order.",
  allModules: "All modules",
  openCount: (open: number, total: number) => `${open} of ${total} open`,
} as const;

export const artefactsCopy = {
  kicker: "Your workspace",
  title: "Everything your modules produce",
  // "Versioned and checked" is what we do to the file, not what the founder
  // gets from it. What they get is that nothing is lost and every earlier
  // draft is still there.
  intro:
    "Every document Claude saves is kept here, including each earlier version.",
  byModule: "By module",
  savedCount: (saved: number, total: number) => `${saved} of ${total} saved`,

  // Empty state reuses the same layout: Start / Locked instead of Read / Download.
  readCta: "Read document",
  downloadCta: "Download",
  startCta: "Start module",
  lockedCta: "Locked",
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
    "Claude is connected, but setting up your workspace didn't finish. Try again in a moment, and tell your program lead if it keeps happening.",
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
  // No longer mentions the password. That clause dates from before
  // `hasChangedInvitationPassword` existed, when a dedicated prompt could
  // never have turned itself off — there is one now (PasswordPrompt), and
  // two nudges about the same task on the same screen is one too many.
  // "The toolkit uses it" also named the product to its own user; what the
  // founder cares about is that they stop being addressed by their email.
  body: "So we can address you by name instead of your email address.",
  cta: "Go to profile",
} as const;
