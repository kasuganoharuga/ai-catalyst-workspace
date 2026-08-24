// ── Mentor ──────────────────────────────────────────────────────────────
//
// Strings for the Mentor half of the shared (app) shell: /dashboard stats,
// /founders list + detail, artefact document, and invitations. Grouped
// separately from the Founder-facing copy above rather than interleaved
// with it, since the two personas never share a screen.

export const mentorDashboardCopy = {
  kicker: "Mentor",
  greeting: (name: string) => `Hi ${name}`,
  intro: "Where founders stand, and what moved recently.",
  // Every Founder on the platform, not just the Mentor's own assignments —
  // see MENTOR_SEES_ALL_FOUNDERS in packages/services/src/internal/mentor-scope.ts.
  statFounders: "Founders on the platform",
  statAverageProgress: "Average progress",
  statAverageProgressEmpty: "—",
  statActiveWeek: "Active this week",
  progressHeading: "Progress mix",
  progressTotal: (count: number) => `${count} founder${count === 1 ? "" : "s"}`,
  progressLabels: {
    notStarted: "Not started",
    justStarted: "Just started",
    inProgress: "In progress",
    complete: "Complete",
  },
  recentHeading: "Recent activity",
  recentViewAll: "Founders",
  recentEmpty:
    "No module completions yet — activity shows up here as founders finish work.",
  recentLine: (progress: string, date: string) =>
    `${progress} modules · last activity ${date}`,
} as const;

// Mentor's own founder-preview sandbox — see
// packages/services/src/mentor/founder-preview.ts. intro* is the entry
// point on its own /sandbox page (deliberately not the dashboard — this is
// a minor, optional feature); the rest is the exit banner shown across the
// (app) shell while previewing.
export const founderPreviewCopy = {
  introHeading: "See what Founders see",
  introBody:
    "Walk the Founder flow yourself in your own sandbox — nothing here touches a real Founder's data.",
  introExistingNote:
    "You already have a sandbox — this picks up right where you left off.",

  // Shown when no sandbox exists yet. An invitation rather than a bare
  // button: until you have one there is nothing on this page to explain
  // what a sandbox actually gets you.
  emptyTitle: "You haven't started a sandbox yet",
  emptyBody:
    "Starting one gives you your own Workspace and a first idea to work from, so you can walk the modules and hand off to your AI assistant exactly the way a Founder does.",

  // Labels for the existing sandbox's own progress. The three stat labels
  // are deliberately mentorFounderDetailCopy's, not copies of them — the
  // sandbox and a real Founder must not come to measure the same things
  // under different words.
  // Why /company-profile is locked during preview, and deliberately not
  // the standard PreviewLockedNotice reason: company_profiles is keyed by
  // workspace_id, so it genuinely is sandbox data — it's left out because
  // nothing reads it, not because it would touch the real account. A Mentor
  // has no company profile of their own, so this must not tell them to exit
  // preview and go edit one.
  companyProfileLockedBody:
    "No module reads a company profile, so the sandbox leaves it out. The Founders you support each fill in their own.",

  startedPrefix: "Started",
  upNextLabel: "Up next",
  notStartedNote:
    "Nothing in it yet — opening the sandbox starts your first run.",
  allModulesCompleteNote: "Every module in the sandbox is complete.",

  enterCta: "Try the Founder flow",
  // Shown instead of enterCta once a sandbox already exists — same action
  // (enterFounderPreviewAction), worded for a return visit rather than a
  // first one.
  continueCta: "Continue in sandbox",
  bannerMessage:
    "You're previewing the Founder experience in your own sandbox — nothing here is a real Founder's data.",
  exitCta: "Exit preview",
  restartCta: "Restart sandbox",
  restartConfirm:
    "Start the sandbox over? This archives its current progress — nothing is deleted, but you'll begin a fresh run. This cannot be undone from here.",

  // A Mentor only ever has one sandbox to work in. Starting a new one is
  // more destructive than restarting (it replaces the sandbox itself, not
  // just its current run), so this goes through a proper dialog rather
  // than restartCta's window.confirm.
  newSandboxCta: "Start a new sandbox",
  newSandboxConfirmTitle: "Start a new sandbox?",
  newSandboxConfirmBody:
    "This replaces your current sandbox with a fresh one. You won't be able to get back to the one you have now from here — nothing is deleted, but there's no way back to it in the product.",
  newSandboxConfirmCta: "Start new sandbox",
  newSandboxConfirmCancel: "Cancel",
} as const;

export const mentorOverviewCopy = {
  kicker: "Mentor",
  title: "Founders",
  intro:
    "Every founder on the platform — track how they're progressing and read what they've saved. Sign-off stays with them, not you.",
  summaryLine: (founders: number, started: number, completed: number) =>
    `${founders} founder${founders === 1 ? "" : "s"} · ${started} started · ${completed} module${completed === 1 ? "" : "s"} completed`,
  inviteCta: "Invite a founder",
  emptyTitle: "No founders yet",
  emptyBody: "Founders appear here as soon as they accept an invitation.",
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
  /** Badge on a row for the Founder(s) assigned to the viewing Mentor. */
  assignedBadge: "Assigned to you",
} as const;

export const mentorFounderDetailCopy = {
  kicker: "Founder",
  backLink: "Founders",
  notStartedTitle: "Hasn't started yet",
  notStartedBody:
    "This founder has accepted their invitation but hasn't opened the programme yet.",
  statModules: "Modules completed",
  statArtefacts: "Artefacts saved",
  statLastActivity: "Last activity",
  never: "None yet",
  /** Same section label as the Founder Artefacts page — outputs by module. */
  artefactsHeading: "By module",
  noArtefacts: "No deliverables saved yet.",
} as const;

export const mentorArtefactDocumentCopy = {
  kicker: "Deliverable",
  backLink: "Back to progress",
  savedLine: (version: number, savedAt: string) =>
    `Version ${version} · saved ${savedAt}`,
  readOnlyNote:
    "The document itself is read-only — the founder still signs their own module off. Use comments to leave feedback on a section.",
} as const;

export const mentorInvitationsCopy = {
  kicker: "Mentor",
  title: "Invite founders",
  intro:
    "Share the one-time code with the founder yourself — there is no email delivery yet. When they accept, their workspace is created and comes under your support automatically.",
  backLink: "Founders",
  formEmailLabel: "Founder email",
  formEmailPlaceholder: "founder@company.com",
  formSubmitIdle: "Invite founder",
  formSubmitPending: "Sending invitation…",
  confirmTitle: "Send founder invitation?",
  confirmBody: (email: string) =>
    `Create a one-time invite for ${email}. You will need to share the code yourself — there is no email delivery yet.`,
  confirmCancel: "Cancel",
  confirmSubmit: "Send invitation",
  confirmSubmitPending: "Creating…",
  inviteCreated: "Founder invitation created",
  inviteCreatedDescription:
    "Copy the one-time code below and share it manually.",
  tokenHeading: "One-time code — copy it now",
  tokenNote:
    "This code is shown once and cannot be retrieved again. Send it to the founder yourself.",
  sectionHeading: "Sent invitations",
  emptyBody: "You haven't invited anyone yet.",
  revokeCta: "Revoke",
  revokePending: "Revoking…",
  revokeConfirmTitle: "Revoke invitation?",
  revokeConfirmBody:
    "The one-time code will stop working. You can send a new invite later if needed.",
  revokeConfirmCancel: "Cancel",
  revokeConfirmSubmit: "Revoke",
  inviteRevoked: "Invitation revoked",
  // Same column-header treatment as the founders list — the two Mentor
  // pages are read one after the other and should scan the same way.
  columnEmail: "Email",
  columnSent: "Sent",
  columnExpires: "Expires",
  columnStatus: "Status",
} as const;
