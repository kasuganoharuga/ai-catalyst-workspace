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
