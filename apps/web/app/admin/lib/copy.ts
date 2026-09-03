export const adminActionCopy = {
  inviteCreated: (roleLabel: string) => `${roleLabel} invitation created`,
  inviteCreatedDescription: "The invitation email is on its way.",
  inviteEmailFailedDescription:
    "The invitation email failed to send — copy the sign-in details below and share them manually.",
  credentialsHeadingEmailFailed:
    "Email failed — copy these sign-in details now",
  credentialsNoteEmailFailed: (role: string) =>
    `These details are shown once and cannot be retrieved again. Share them with the invited ${role} manually.`,
  mentorAssigned: "Mentor updated",
  userDeleted: "User deleted",
  passwordReset: "Temporary password issued",
} as const;

export const adminDashboardCopy = {
  kicker: "Admin",
  greeting: (name: string) => `Hi ${name}`,
  intro: "Live accounts, mentor coverage, and a snapshot of new users.",
  statLiveAccounts: "Live accounts",
  statCoverage: "Mentor coverage",
  statCoverageEmpty: "—",
  statJoinedWeek: "Joined this week",
  roleHeading: "Role mix",
  roleTotal: (count: number) => `${count} account${count === 1 ? "" : "s"}`,
  roleLabels: {
    founder: "Founders",
    mentor: "Mentors",
    admin: "Admins",
    pending: "Pending",
  },
  recentHeading: "New users overview",
  recentViewAll: "All users",
  recentEmpty: "No new users yet.",
  recentRoleLabels: {
    founder: "Founder",
    mentor: "Mentor",
    admin: "Admin",
    pending: "Pending",
  },
  recentLine: (roleLabel: string, date: string) =>
    `${roleLabel} · joined ${date}`,
} as const;
