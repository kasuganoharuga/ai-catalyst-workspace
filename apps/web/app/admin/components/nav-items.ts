export type AdminNavItem = {
  href: string;
  label: string;
};

export const ADMIN_PRIMARY_NAV_ITEMS: AdminNavItem[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/invitations", label: "Invitations" },
];

// Same account surface Mentors get: profile + password. No company profile
// or AI connection — those are Founder-only concepts.
export const ADMIN_ACCOUNT_NAV_ITEMS: AdminNavItem[] = [
  { href: "/admin/profile", label: "Your profile" },
  { href: "/admin/account-security", label: "Account security" },
];
