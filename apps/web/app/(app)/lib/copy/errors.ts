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
  interviewCompleted: "Interview saved",
  interviewSubmittedForReview: "Interviews submitted for review",
  evidenceConfirmed: "Evidence confirmed",
  evidenceReopened: "Evidence reopened for editing",
  profileSaved: "Profile saved",
  companyProfileSaved: "Company profile saved",
  ventureCreated: "Idea added",
  actionFailedTitle: "That didn't work",
  /** PDF workbook download failed; Markdown remains available from the same control. */
  pdfDownloadFailedFallback: "Couldn't generate the PDF. Try Markdown instead.",
  pdfDownloadFailedHint: "Markdown download is still available.",
} as const;

// ── Profile prompt ──────────────────────────────────────────────────────

// Nudge on dashboard, not a gate — disappears once name is saved.
export const profilePromptCopy = {
  title: "Add your name",
  body: "So we can address you by name instead of your email address.",
  cta: "Go to profile",
} as const;
