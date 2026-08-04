// Founder-facing copy: onboarding, connection, modules, workspace, profile, errors.
// Australian English: program, artefact, authorise (-ise). OAuth wire values stay as the spec spells them.
// Module titles, subtitles, and question texts live in the DB (content-seed), not here.
//
// Naming an assistant: only two surfaces do it — the connection page (it is
// a walkthrough of one specific product's settings) and the hand-off (it
// opens one specific app). Those live in `assistantCopy`, keyed by provider.
// Everything else in this file is neutral on purpose and says "AI" or "your
// AI assistant"; copy.test.ts enforces that.

import type { PreferredAiProvider } from "@ai-catalyst/shared";

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

  troubleshootingTitle: "If something doesn't look right",
  watchRetry: "Try again",

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

// ── Per-assistant connection copy ───────────────────────────────────────

export interface AssistantCopy {
  /** The founder-facing product name. Never render the provider enum. */
  name: string;
  title: string;
  titleConnected: string;
  /** Two intros: disconnected vs already-connected audiences. */
  intro: string;
  introConnected: string;
  expiredBody: string;

  setupTitle: string;
  setupBody: string;
  manualSteps: ManualStep[];
  /**
   * Only present when the assistant's settings are also reachable in a
   * browser. Absent means the step renders no fallback line at all.
   */
  settingsFallbackPrefix?: string;
  settingsFallbackLink?: string;

  troubleshooting: { symptom: string; fix: string }[];

  waitingTitle: string;
  waitingBody: string;
  connectedTitle: string;
  connectedBody: string;

  disconnectTitle: string;
  disconnectBody: string;
  disconnectDone: string;

  statusLastActivity: string;
  statusActiveNote: string;
  statusNeverUsedNote: string;
  statusIdleNote: string;

  privacyBody: string;

  handoff: {
    /** Deep-link shape: the primary button. Copy-first shape: the secondary link. */
    openCta: string;
    retryCta: string;
    hint: string;
    /** Deep-link shape only — the browser escape hatch. */
    fallbackPrefix?: string;
    fallbackLink?: string;
  };
}

export const assistantCopy: Record<PreferredAiProvider, AssistantCopy> = {
  claude: {
    name: "Claude",
    title: "Connect Claude",
    titleConnected: "Claude connection",
    intro:
      "Connect Claude once. It takes about two minutes, and your first module opens as soon as you're done.",
    introConnected:
      "Claude is connected to this workspace. Everything below is here if you want to check on it or end access.",
    expiredBody:
      "Your saved work is safe. Set Claude up again with the address below.",

    setupTitle: "Add the connector in Claude",
    setupBody: "Five steps, once. You'll approve access at the end.",

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
    ],

    settingsFallbackPrefix: "Nothing happened?",
    settingsFallbackLink: "Open connectors in your browser",

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

    // Disconnect here ends server access; removing the connector in Claude does not.
    disconnectTitle: "Disconnect Claude",
    disconnectBody:
      "Ends Claude's access to this workspace. The connector stays in your Claude settings, and reconnecting means approving access again.",
    disconnectDone: "Claude no longer has access to this workspace.",

    statusLastActivity: "Claude last used it",
    statusActiveNote:
      "Claude used your workspace in the last few minutes, so everything is working.",
    statusNeverUsedNote:
      "Claude has access but hasn't used it yet. Your first module will be the first thing that does.",
    statusIdleNote:
      "Claude hasn't used your workspace recently, which usually just means it's closed. Ask it to do something here, then refresh.",

    // End access on this page — removing the connector in Claude has no effect here.
    privacyBody:
      "Claude can read module questions, save your answers, and store the documents you produce. We cannot see your Claude conversations. Everything Claude does here is recorded, and you can end access from this page at any time.",

    handoff: {
      openCta: "Continue in Claude",
      retryCta: "Retry in Claude",
      // claude:// does nothing visible without the desktop app — phrase fallback as a symptom.
      hint: "Opens the Claude desktop app with your message ready to send.",
      fallbackPrefix: "Nothing happened?",
      fallbackLink: "Open in your browser",
    },
  },

  // "openai" is the value the check constraint stores; ChatGPT is the only
  // name a founder ever sees.
  openai: {
    name: "ChatGPT",
    title: "Connect ChatGPT",
    titleConnected: "ChatGPT connection",
    // Three minutes, not two: this route has more manual navigation than
    // Claude's, because nothing deep-links past the settings window.
    intro:
      "Connect ChatGPT once. It takes about three minutes, and your first module opens as soon as you're done.",
    introConnected:
      "ChatGPT is connected to this workspace. Everything below is here if you want to check on it or end access.",
    expiredBody:
      "Your saved work is safe. Set ChatGPT up again with the address below.",

    setupTitle: "Add the server in ChatGPT",
    setupBody: "Five steps, once. You'll approve access at the end.",

    manualSteps: [
      {
        title: "Open settings in the ChatGPT desktop app",
        body: "The connection lives in the desktop app. It can't be set up at chatgpt.com.",
        linkLabel: "Open ChatGPT settings",
        illustration: "chatgpt-settings",
      },
      {
        title: "Open Plugins, then the MCPs tab",
        body: "Plugins sits under Integrations. Once it opens, switch to the MCPs tab.",
        illustration: "chatgpt-plugins",
      },
      {
        title: "Add a server",
        body: "Choose Add server, then Connect to a custom MCP.",
        illustration: "chatgpt-add-server",
      },
      {
        title: "Name it, choose Streamable HTTP, and paste this address",
        // STDIO is the default and hides the URL field, which reads as the
        // form being broken rather than as the wrong type being selected.
        body: 'Call it anything — "AI Catalyst" works. The type must be Streamable HTTP, not STDIO. Leave the token and header fields empty.',
        showAddress: true,
        illustration: "chatgpt-custom-mcp",
      },
      {
        title: "Save, then approve access",
        body: "ChatGPT opens your browser to finish. Sign in there with the email you use here, then approve.",
        illustration: "chatgpt-approve",
      },
    ],

    // No settingsFallback*: Plugins and MCPs exist only in the desktop app,
    // so there is no browser URL to offer. The step renders no fallback.

    troubleshooting: [
      {
        symptom: "Nothing happened when you opened settings",
        fix: "The link only works when the ChatGPT desktop app is installed. Open the app yourself and go to Settings, then carry on from step 2.",
      },
      {
        symptom: "There's no Plugins or MCPs anywhere",
        fix: "You're in the browser. Plugins, and the MCPs tab inside it, only exist in the ChatGPT desktop app — chatgpt.com has neither.",
      },
      {
        symptom: "It's asking for a command instead of an address",
        fix: "The type is still set to STDIO, which is for servers running on your own machine. Switch it to Streamable HTTP and the address field appears.",
      },
      // ChatGPT approves in an isolated window with no session — see the
      // comment in app/oauth/continue/route.ts. This is where founders stall.
      {
        symptom: "The approval page asks you to sign in",
        fix: "ChatGPT opens approval in its own window, which doesn't share your browser session. Sign in with the same email you use here, then approve.",
      },
      {
        symptom: "You approved access, but this page hasn't moved",
        fix: "Come back to this tab and leave it open for a few seconds. It checks while you're looking at it.",
      },
    ],

    waitingTitle: "Waiting for ChatGPT",
    waitingBody:
      "Leave this page open. Your first module opens automatically once ChatGPT is connected.",
    connectedTitle: "ChatGPT is connected",
    connectedBody: "Opening your first module.",

    disconnectTitle: "Disconnect ChatGPT",
    disconnectBody:
      "Ends ChatGPT's access to this workspace. The server stays in your ChatGPT settings, and reconnecting means approving access again.",
    disconnectDone: "ChatGPT no longer has access to this workspace.",

    statusLastActivity: "ChatGPT last used it",
    statusActiveNote:
      "ChatGPT used your workspace in the last few minutes, so everything is working.",
    statusNeverUsedNote:
      "ChatGPT has access but hasn't used it yet. Your first module will be the first thing that does.",
    statusIdleNote:
      "ChatGPT hasn't used your workspace recently, which usually just means it's closed. Ask it to do something here, then refresh.",

    privacyBody:
      "ChatGPT can read module questions, save your answers, and store the documents you produce. We cannot see your ChatGPT conversations. Everything ChatGPT does here is recorded, and you can end access from this page at any time.",

    handoff: {
      openCta: "Continue in ChatGPT",
      retryCta: "Retry in ChatGPT",
      // No fallback line: unlike Claude, there is no browser URL to offer
      // underneath — a chat at chatgpt.com has no route to this
      // workspace's MCP connector, desktop app installed or not.
      //
      // Work mode called out on purpose: it's the surface the MCP
      // connector actually runs in, and a founder landing in an ordinary
      // chat has no obvious reason to switch before sending the message.
      hint: "Opens the ChatGPT desktop app with your message ready to send. We recommend using Work mode.",
    },
  },
};

// ── Handing over to the assistant ───────────────────────────────────────

// Neutral half of the hand-off card. The provider-specific half is
// `assistantCopy[provider].handoff`.
export const handoffCopy = {
  promptLabel: "Send this",
  copyLabel: "Copy",
  copyCta: "Copy the message",
  copyRetryCta: "Copy it again",
} as const;

// ── Dashboard ───────────────────────────────────────────────────────────

export const dashboardCopy = {
  // First visit: "Welcome back" is untrue before they've been here.
  greetingFirstVisit: (name: string) => `Welcome ${name}`,
  greetingReturning: (name: string) => `Welcome back, ${name}`,

  subNeedsConnection:
    "Connect your AI assistant once. That's the only setup step.",
  subNeedsRun: "Your program is ready to open.",
  subInProgress: "Module 1 is open. Work through it with your AI assistant.",
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

  actionConnectTitle: "Connect your AI assistant",
  actionConnectBody:
    "One connection links your assistant to this workspace. It takes a couple of minutes.",
  actionConnectCta: "Connect it",

  actionOpenRunTitle: "Open your program",
  actionOpenRunBody: "Takes you straight to your first module.",
  actionOpenRunCta: "Open program",

  actionModule1Title: "Start Module 1",
  actionModule1Body:
    "Six questions about your idea, then you decide: proceed, pivot or kill.",
  actionModule1Cta: "Open Module 1",

  actionDoneTitle: "Module 1 is complete",
  actionDoneBody: "Your verdict is saved and versioned in your artefacts.",
  actionDoneCta: "View artefacts",

  statModules: "Modules unlocked",
  statArtefacts: "Artefacts saved",
  modulesHeading: "Your modules",
  modulesViewAll: "View all",
} as const;

// ── First run ───────────────────────────────────────────────────────────

// The dialog every founder sees once. Only the assistant step is required:
// a password nobody can remember and a name nobody has typed are both
// things the dashboard already nudges about, but which assistant to set up
// decides what the rest of the product shows, so there is no sensible
// default to skip to. Mentors never see this dialog at all.
export const onboardingCopy = {
  progress: (step: number, total: number) => `Step ${step} of ${total}`,

  // Placeholder pitch — deliberately short, and written to be replaced.
  // One sentence, then the arc as a diagram: the paragraph this used to
  // carry ("you work through it one module at a time…") is the sort of
  // thing nobody reads on a screen standing between them and the product,
  // and the three labels below say it faster.
  welcomeTitle: "Welcome to AI Catalyst",
  welcomeBody:
    "Turn a hunch into a blueprint you can put in front of an investor, a co-founder or a first customer.",
  welcomeJourney: {
    start: "A hunch",
    middle: "Module by module",
    end: "A blueprint",
  },
  welcomeSetupNote: "Three quick things first — about two minutes.",
  welcomeCta: "Get started",

  passwordTitle: "Pick your own password",
  // No "enter your current password first": they typed it to get here.
  passwordBody:
    "You signed in with the password your invitation shipped with. Replace it with one only you know.",
  passwordCta: "Save and continue",
  passwordPending: "Saving…",

  nameTitle: "What should we call you?",
  nameBody:
    "So we can address you by name instead of your email address. Nothing here is published.",
  nameFirstLabel: "First name",
  nameLastLabel: "Last name",
  nameCta: "Save and continue",
  namePending: "Saving…",

  assistantTitle: "Which AI assistant will you use?",
  assistantBody:
    "It decides which set-up instructions you get and where your modules hand over. You can change it later in your profile.",
  assistantCta: "Finish setup",
  assistantPending: "Saving…",
  // Said once above both cards rather than per card. Either way the
  // connection is made in the assistant's desktop app, so a note on each
  // one only invited a comparison there isn't one to make — and the
  // version that mentioned a browser read as though Claude could be set up
  // without installing anything, which is not the route these steps take.
  assistantPlatformNote: "Either one is set up in its desktop app.",
} as const;

// ── Assistant preference (profile page) ─────────────────────────────────

// Switching the preference and switching the connection are two different
// things, and the second one is destructive. This section has to be honest
// about that before the founder clicks, the same way the OAuth consent
// screen's replacement warning is.
export const assistantSectionCopy = {
  heading: "AI assistant",
  body: "Decides which set-up instructions you get and which app your modules hand over to.",
  currentLabel: "Currently set to",
  switchCta: (name: string) => `Switch to ${name}`,
  switchPending: "Saving…",
  switched: (name: string) => `Set up for ${name}.`,
  // A safety net, not an expected state: both directions now keep the two
  // in step. Reachable only if the disconnect failed after the preference
  // was saved, so it says what to do rather than just describing.
  mismatchNote: (connected: string, next: string) =>
    `${connected} is still connected, though your instructions are set to ${next}. Disconnect it on the connection page, or switch back.`,
  setupLink: "Set it up",

  // Confirmation before switching. Switching signs the current assistant
  // out, so this is the last point at which it can be called off.
  confirmTitle: (next: string) => `Switch to ${next}?`,
  confirmBodyConnected: (connected: string, next: string) =>
    `${connected} will be signed out of this workspace. Your saved work stays where it is, but ${connected} loses access immediately and you'll set ${next} up from scratch.`,
  confirmBodyDisconnected: (next: string) =>
    `Your set-up instructions and every hand-off button switch to ${next}. Nothing is connected right now, so nothing is signed out.`,
  confirmCta: (next: string) => `Switch to ${next}`,
  confirmPending: "Switching…",
  confirmCancel: "Cancel",
} as const;

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

// ── Module 1 ────────────────────────────────────────────────────────────

export const module1Copy = {
  stepBrief: "What this is",
  stepWork: "Work through it",
  stepConfirm: "Confirm and unlock",

  briefTitle: "What this module is for",
  briefBody:
    "Your AI assistant plays a veteran investor and challenges your idea. You'll cover where it breaks, who you're really competing with, and what would have to be true for it to work. You finish with a decision you can defend: proceed, pivot or kill.",

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
      body: "You'll be given the strongest case against your idea, and vague answers will be challenged. That is intentional.",
    },
    {
      lead: "This doesn't replace talking to customers.",
      body: "Anything without a real conversation behind it is recorded as an assumption, not evidence.",
    },
  ],

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
    "We haven't found a verdict in your workspace yet. Once it's saved, you sign it off here.",
  confirmNoFileLocked:
    "You can look ahead here. You'll be able to start this module and save a verdict once the one before it is done.",
  confirmNoFileNotStarted:
    "You can look ahead here. Sign-off appears once your verdict has been saved.",
  confirmUnavailable: "Sign-off opens along with this module.",
  confirmFinishFirst: "Finish the conversation in the previous step first.",
  reviseHint:
    "Not happy with it? Ask for a revision. Nothing is locked in until you confirm.",

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
      ? `You chose pivot. ${nextModuleTitle} is open if you want to continue with the revised framing. You can also re-run this module first.`
      : "You chose pivot. Re-run this module for a fresh pressure-test on the revised idea.";
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
    "Your AI assistant isn't connected yet. Finish approving access there, then try again.",
  noActiveVenture:
    "We couldn't find your active program. Open the dashboard and try again, or ask your program lead.",
  ventureUnavailable:
    "Your program workspace isn't available. Open the dashboard, or ask your program lead.",
  setupFailed:
    "Your AI assistant is connected, but setting up your workspace didn't finish. Try again in a moment, and tell your program lead if it keeps happening.",
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

// ── Mentor ──────────────────────────────────────────────────────────────
//
// Strings for the Mentor half of the shared (app) shell: /dashboard's
// mentor branch, a Founder's progress detail, their artefact document, and
// Mentor invitations. Grouped separately from the Founder-facing copy
// above rather than interleaved with it, since the two personas never
// share a screen.

export const mentorOverviewCopy = {
  kicker: "Mentor",
  title: "Your founders",
  intro:
    "Track how each founder is progressing and read what they've saved — sign-off stays with them, not you.",
  summaryLine: (founders: number, started: number, completed: number) =>
    `${founders} founder${founders === 1 ? "" : "s"} · ${started} started · ${completed} module${completed === 1 ? "" : "s"} completed`,
  inviteCta: "Invite a founder",
  emptyTitle: "No founders yet",
  emptyBody: "Founders appear here as soon as they accept your invitation.",
  searchLabel: "Search founders",
  searchPlaceholder: "Search by name, email or workspace",
  noMatchesTitle: "No founders match that search",
  noMatchesBody: "Try a different name, email, or workspace.",
  // Column headers for the list. Without them a row reads "0 / 1 · 3 Aug"
  // and a Mentor has to guess whether the date is when they joined, when
  // they last did something, or when something is due.
  columnFounder: "Founder",
  columnProgress: "Progress",
  columnActivity: "Last activity",
  columnStatus: "Status",
} as const;

export const mentorFounderDetailCopy = {
  kicker: "Founder",
  backLink: "My founders",
  notStartedTitle: "Hasn't started yet",
  notStartedBody:
    "This founder has accepted their invitation but hasn't opened the programme yet.",
  statModules: "Modules completed",
  statArtefacts: "Artefacts saved",
  statLastActivity: "Last activity",
  never: "None yet",
  modulesHeading: "Modules",
  noArtefacts: "No deliverables saved yet.",
  readCta: "Read",
} as const;

export const mentorArtefactDocumentCopy = {
  kicker: "Deliverable",
  backLink: "Back to progress",
  savedLine: (version: number, savedAt: string) =>
    `Version ${version} · saved ${savedAt}`,
  readOnlyNote:
    "Read-only: the founder still signs their own module off. Review and comment tools arrive in a later phase.",
} as const;

export const mentorInvitationsCopy = {
  kicker: "Mentor",
  title: "Invite founders",
  intro:
    "Share the one-time code with the founder yourself — there is no email delivery yet. When they accept, their workspace is created and comes under your support automatically.",
  backLink: "My founders",
  formEmailLabel: "Founder email",
  formEmailPlaceholder: "founder@company.com",
  formSubmitIdle: "Invite founder",
  formSubmitPending: "Sending invitation…",
  tokenHeading: "One-time code — copy it now",
  tokenNote:
    "This code is shown once and cannot be retrieved again. Send it to the founder yourself.",
  sectionHeading: "Sent invitations",
  emptyBody: "You haven't invited anyone yet.",
  revokeCta: "Revoke",
  revokePending: "Revoking…",
  // Same column-header treatment as the founders list — the two Mentor
  // pages are read one after the other and should scan the same way.
  columnEmail: "Email",
  columnSent: "Sent",
  columnExpires: "Expires",
  columnStatus: "Status",
} as const;
