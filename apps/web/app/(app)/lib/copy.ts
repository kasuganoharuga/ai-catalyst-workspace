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
  // Names whichever Module is actually next — not hard-coded to Module 1,
  // since a founder who has finished it moves on to Modules 2, 3 and 4.
  subInProgress: (moduleTitle: string) =>
    `${moduleTitle} is open. Work through it with your AI assistant.`,
  // Reachable once every Module currently unlockable is done — more open
  // as new content ships, so this never claims the program itself is over.
  subDone: "Everything open right now is done. More opens as it's ready.",

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

  // Names whichever Module is actually next; body comes from that Module's
  // own catalog subtitle rather than a second hand-authored blurb here.
  actionModuleTitle: (moduleTitle: string) => `Start ${moduleTitle}`,
  actionModuleCta: "Open module",

  // Reachable once every Module currently unlockable is done.
  actionDoneTitle: "Everything open right now is complete",
  actionDoneBody: "Your documents are saved and versioned in your artefacts.",
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
  stepWork: "Work through it",
  stepConfirm: "Confirm and unlock",

  whyHeading: "Why it matters",
  beforeHeading: "Before you begin",

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

  // Only Module 1 has a Founder decision to record alongside its document —
  // Phase 3 makes this row conditional on decisionQuestions existing at all
  // rather than showing "Comes after the verdict." forever on Modules with
  // no decision concept. Left as-is here; this pass only splits the copy.
  progressDecision: "Proceed, pivot or kill recorded",
  progressDecisionDone: "Your decision is saved.",
  progressDecisionPending: "Comes after the verdict.",
  progressChecks: "Everything required is included.",
  progressChecksDone: "Read it over whenever you're ready.",
  progressChecksPending: "Happens automatically once your documents are saved.",

  confirmNoFileLocked:
    "You can look ahead here. You'll be able to start this module and save your documents once the one before it is done.",
  confirmNoFileNotStarted:
    "You can look ahead here. Sign-off appears once your documents have been saved.",
  confirmUnavailable: "Sign-off opens along with this module.",
  confirmFinishFirst: "Finish the conversation in the previous step first.",
  reviseHint:
    "Not happy with it? Ask for a revision. Nothing is locked in until you confirm.",

  documentHeading: "The document",
  documentCovers: "It should cover",
  documentRead: "Read document",
  documentDownload: "Download",
  // Shown instead of documentDownload once a workbook exists for this
  // Artifact — same primary/secondary split as artefactsCopy's pair. Not
  // all PDF renderers are fillable (Module 2's Ideal Customer Avatar is a
  // read-only styled export), so this stays generic rather than claiming
  // "fillable" for every one of them.
  documentDownloadWorkbook: "Download PDF",
  documentDownloadSource: "Markdown source",
  documentDecisionLabel: "Your decision",
  documentNotSaved: "Not saved yet.",
  // A supporting document the Module accepts but never blocks completion
  // on (Module 4's interview notes). Without this, an unsaved optional
  // document reads exactly like a missing required one.
  documentNotSavedOptional:
    "Not saved yet — sign-off doesn't wait on this one.",
  backToIdeas: "Back to your ideas",
  documentExpand: "Show the rest",
  documentCollapse: "Show less",
  documentOpenFull: "Open full page",
  documentMeta: (version: number, savedAt: string | null) =>
    savedAt ? `Version ${version} · ${savedAt}` : `Version ${version}`,
} as const;

export interface ModuleBeforeItem {
  lead: string;
  /** Omitted where the lead says the whole thing — a warning carries more weight unexplained. */
  body?: string;
  /**
   * A prerequisite the founder must have met off-platform before starting,
   * not merely advice about how to answer well. Rendered as a warning
   * rather than another bullet — Module 4 is unworkable without the
   * Module 3 interviews, and a founder who reads past that wastes the
   * module.
   */
  severity?: "warning";
}

/**
 * The vague-vs-specific example card on the work step. Modules 1 and 2 chain
 * theirs deliberately: Module 1's `strongExample` (the customer sharp enough
 * to pressure-test) becomes Module 2's `weakExample` (the starting point it
 * narrows into a beachhead) — the same customer, carried forward and made
 * more specific, not two unrelated examples.
 */
export interface ModuleCoachingCard {
  heading: string;
  weakLabel: string;
  weakExample: string;
  strongLabel: string;
  strongExample: string;
  footer: string;
}

export interface ModuleBriefCopy {
  briefTitle: string;
  briefBody: string;
  whyBody: string;
  whyBuildsOn: (moduleIndex: string) => string;
  before: ModuleBeforeItem[];
  /**
   * Something the founder must hand the assistant before the questions
   * start — the first row of the work step's progress list, so it reads as
   * part of the same sequence as the rows it gates. Only Module 4 has one:
   * its facilitator prompt refuses to open the evidence questions until the
   * Module 3 interview notes have been saved to the workspace, and the
   * founder should learn that here rather than from the assistant. The row
   * is ticked by the saved Artifact, not by an answered Question — see
   * `isWorkPrerequisiteMet`.
   */
  workPrerequisite?: { label: string; pending: string; done: string };
  /**
   * What the founder has to go and do off-platform before the next Module
   * can work, shown on the confirm step once this one is signed off —
   * which is the moment it becomes their job. Only Module 3 has one: it
   * hands over five interviews to run, and Module 4 refuses to open its
   * questions until the notes come back. Saying so only in Module 4's
   * brief tells them after they have already started it.
   */
  completedNextStep?: { title: string; body: string };
  questionsLabel: string;
  /** Work-step CheckLine label/pending-detail for a Module with exactly one Artifact. */
  progressVerdict: string;
  progressVerdictPending: string;
  confirmTitle: string;
  confirmBody: string;
  confirmNoFileTitle: string;
  confirmNoFileBody: string;
  /** Undefined for Modules 3-4 today — StrongAnswerCard renders nothing without one. */
  coachingCard?: ModuleCoachingCard;
}

export const MODULE_BRIEF_COPY: Record<string, ModuleBriefCopy> = {
  "module-01-pressure-test": {
    briefTitle: "What this module is for",
    briefBody:
      "Your AI assistant plays a veteran investor and challenges your idea. You'll cover where it breaks, who you're really competing with, and what would have to be true for it to work. You finish with a decision you can defend: proceed, pivot or kill.",
    whyBody:
      "Most ideas fail because nobody asked the hard questions early enough. By the time the market answers them, a year and a lot of money are gone. This is the cheap version of that conversation.",
    whyBuildsOn: (moduleIndex: string) =>
      `Every module after Module ${moduleIndex} builds on the verdict you write here. Vague answers now cost you in each one.`,
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
    questionsLabel: "Six pressure-test questions",
    progressVerdict: "Verdict saved to your workspace",
    progressVerdictPending: "Nothing saved yet.",
    confirmTitle: "Read it over, then confirm",
    confirmBody:
      "Your verdict is saved and nothing is missing from it. Confirming marks this module done. Proceed, pivot and kill all complete it, and the next module opens either way.",
    confirmNoFileTitle: "No file yet",
    confirmNoFileBody:
      "We haven't found a verdict in your workspace yet. Once it's saved, you sign it off here.",
    coachingCard: {
      heading: "From vague to testable",
      weakLabel: "Too vague to test",
      weakExample: "Everyone building a startup needs this.",
      strongLabel: "Specific enough to test",
      strongExample:
        "ANZ pre-seed SaaS founders raising their first $500k who've cold-emailed 50+ investors and stalled.",
      footer:
        "A specific customer, a clear situation, and evidence the problem is real.",
    },
  },

  "module-02-customer-avatar": {
    briefTitle: "What this module is for",
    briefBody:
      "Your AI assistant narrows a broad customer category into one specific beachhead customer — precise enough to find, interview and act on. You'll define who they are, what they need, and how to recognise when they're ready to buy, then confirm a structured Ideal Customer Avatar.",
    whyBody:
      'A product built for "everyone" is a product nobody urgently needs. Naming one beachhead customer precisely turns a vague idea into something you can actually find, interview and test with.',
    whyBuildsOn: (moduleIndex: string) =>
      `Every module after Module ${moduleIndex} builds on the customer you name here. A vague Avatar makes every later module vaguer too.`,
    before: [
      {
        lead: "Allow 20–30 minutes.",
        body: "Eight short conversation blocks, not thirteen separate interrogations.",
      },
      {
        lead: "Be specific rather than polished.",
        body: "A named role, a real trigger moment, and language you'd actually hear beat a tidy persona.",
      },
      {
        lead: "Say honestly when you do not know.",
        body: "An honest gap is recorded as an unknown, not invented to sound complete.",
      },
      {
        lead: "Treat the result as a hypothesis, not evidence.",
        body: "Completing the Avatar doesn't validate it — that's checked separately, field by field.",
      },
    ],
    questionsLabel: "Eight customer-avatar blocks",
    progressVerdict: "Avatar saved to your workspace",
    progressVerdictPending: "Nothing saved yet.",
    confirmTitle: "Read it over, then confirm",
    confirmBody:
      "Your Ideal Customer Avatar is saved. Confirming marks this module done and opens the next one.",
    confirmNoFileTitle: "No file yet",
    confirmNoFileBody:
      "Your Ideal Customer Avatar hasn't arrived yet. Return to your AI assistant and ask it to save the Avatar, then refresh this page.",
    coachingCard: {
      heading: "From testable to targetable",
      weakLabel: "What Module 1 established",
      weakExample:
        "ANZ pre-seed SaaS founders raising their first $500k who've cold-emailed 50+ investors and stalled.",
      strongLabel: "Specific enough to target first",
      strongExample:
        "First-time ANZ B2B SaaS founders raising $300k–$700k, with no warm investor network, who have already contacted 50+ investors without securing enough meetings.",
      footer:
        "Same customer — now narrow them into the first group you can actually find, interview and sell to.",
    },
  },

  "module-03-problem-statement": {
    briefTitle: "What this module is for",
    briefBody:
      "Your AI assistant works from your customer's surface complaint towards a structural root cause using a Five Whys ladder, then turns the result into five interview questions you can take to real customers. This module prepares the interviews — it does not conduct them or analyse the responses.",
    whyBody:
      "The first complaint a customer names is rarely the reason the problem persists. Building for the symptom instead of the root cause is how founders end up solving the wrong problem very well.",
    whyBuildsOn: (moduleIndex: string) =>
      `Every module after Module ${moduleIndex} builds on the root cause and interview questions you settle here. A shallow answer here means the interviews test the wrong thing.`,
    before: [
      {
        lead: "Allow 30–40 minutes.",
        body: 'Working down to a root cause takes a few more "why" turns than it feels like it should.',
      },
      {
        lead: "Be specific rather than polished.",
        body: '"No shared directory exists" beats "communication is hard" — a structural reason beats a tidy sentence.',
      },
      {
        lead: "Expect each answer to be challenged and taken deeper.",
        body: "The ladder stops at the root cause, not at the first plausible-sounding answer.",
      },
      {
        lead: "This module creates interview questions, not customer evidence.",
        body: "You still have to run the five conversations yourself before the next module can grade what came back.",
      },
    ],
    completedNextStep: {
      title: "Next: run the five interviews",
      body: "Nothing here runs them for you. Take your Problem Interview Guide to five matching customers, write each conversation up separately in their own words within 30 minutes, and keep the notes. If you download the fillable PDF workbook to write in during the calls, it stays your own working copy — filling it in saves nothing back to AI Catalyst, so bring the finished notes into Module 4 yourself. The next module opens by grading what actually came back, and can't start without them — three or four is still worth bringing.",
    },
    questionsLabel: "Eight problem-statement questions",
    progressVerdict: "Problem Statement saved to your workspace",
    progressVerdictPending: "Nothing saved yet.",
    confirmTitle: "Confirm your problem and interview documents",
    confirmBody:
      "Your Problem Statement and Problem Interview Guide are saved. Confirming marks this module done and opens the next one.",
    confirmNoFileTitle: "No files yet",
    confirmNoFileBody:
      "Your Module 3 documents haven't arrived yet. Return to your AI assistant and ask it to save the Problem Statement and Problem Interview Guide, then refresh this page.",
  },

  "module-04-evidence-of-unmet-need": {
    briefTitle: "What this module is for",
    briefBody:
      "Your AI assistant inventories and grades the evidence you bring — starting with the notes from your Module 3 interviews — then builds a 30-day validation plan. It also makes the strongest case that the problem may not be real or urgent enough and asks you to respond with evidence.",
    whyBody:
      "Repeated assumptions can feel like validation. Separating what you actually know from what you merely believe keeps you honest before you spend more time building.",
    whyBuildsOn: (moduleIndex: string) =>
      `Module ${moduleIndex} is the last module currently open. Its Roadmap is what you actually do next — the evidence it plans for is what decides whether to keep going.`,
    before: [
      {
        severity: "warning",
        lead: "Do not start this module until you have finished the Module 3 interviews.",
      },
      {
        lead: "Allow 30–40 minutes.",
        body: "Grading evidence honestly and standing up to the counterargument both take a moment's real thought.",
      },
      {
        lead: "Expect your evidence to be challenged.",
        body: "One part of this module argues the other side on purpose. That's by design, not a fault.",
      },
      {
        lead: "This module plans validation experiments; it does not run them for you.",
        body: "The 30-day Roadmap is a to-do list you carry out afterwards.",
      },
    ],
    workPrerequisite: {
      label: "Interview notes",
      pending: "Nothing handed over yet.",
      done: "Saved to your workspace.",
    },
    questionsLabel: "Seven evidence questions",
    progressVerdict: "Evidence saved to your workspace",
    progressVerdictPending: "Nothing saved yet.",
    confirmTitle: "Confirm your evidence and validation documents",
    confirmBody:
      "Your interview notes, Evidence of Unmet Need and 30-Day Validation Roadmap are all saved. Confirming marks this module done.",
    confirmNoFileTitle: "No files yet",
    confirmNoFileBody:
      "Your Module 4 documents haven't arrived yet. Return to your AI assistant and ask it to save Evidence of Unmet Need and 30-Day Validation Roadmap, then refresh this page.",
  },
};

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

// ── Completing a Module with no Founder decision (Modules 2-4 today) ───
//
// module1CompletedTitle/Body/ConfirmCta above assume a proceed/pivot/kill
// decision — meaningful only for Module 1. Every other standard Module has
// no decision to record, so these three read purely off whether a next
// Module is actually open, and never claim one exists when Module 4 (the
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
  downloadCta: "Download",
  // Shown instead of downloadCta once a PDF renderer exists — the PDF
  // becomes the primary download, and the Markdown record moves to a
  // smaller secondary link beside it (operational-workbooks plan §11). Not
  // every renderer is a fillable form (Module 2's Ideal Customer Avatar is
  // a read-only styled export), so this stays generic.
  downloadWorkbookCta: "Download PDF",
  downloadSourceCta: "Markdown source",
  startCta: "Start module",
  lockedCta: "Locked",
  storageNote: "Files are stored in your workspace, not just in the chat.",

  // Handoff cards — what a founder carries between two modules, rather than
  // what either module produces. Worded so the card explains its own place
  // in the sequence without a step number to lean on.
  interviewNotesTitle: "Interview notes",
  interviewNotesSubtitle:
    "The Problem & Five Whys interviews as you recorded them. Hand them to your assistant in whatever shape you have — a file, a doc, or pasted text — and what's kept here is formatted Markdown for Proof to grade.",
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
