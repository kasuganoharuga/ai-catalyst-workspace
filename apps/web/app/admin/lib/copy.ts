export const adminActionCopy = {
  inviteCreated: (roleLabel: string) => `${roleLabel} invitation created`,
  inviteCreatedDescription:
    "Copy the one-time code below and share it manually.",
  inviteRevoked: "Invitation revoked",
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
