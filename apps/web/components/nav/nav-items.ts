export type NavItemConfig = {
  href: string;
  label: string;
  /**
   * Active-state match for this item is exact only — e.g. "/admin" must
   * not also light up for "/admin/users". Every other item matches its
   * own nested routes too (see use-active-nav-item.ts).
   */
  exact?: boolean;
};

export type NavRole = "founder" | "mentor" | "admin";

// Founder and Mentor share /dashboard as the first item (role-aware content
// in app/(app)/dashboard/page.tsx). Mentors also get /founders for the
// directory that used to live on that same URL.
const FOUNDER_PRIMARY_NAV_ITEMS: NavItemConfig[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/modules", label: "Modules" },
  { href: "/artefacts", label: "Artefacts" },
];

const MENTOR_PRIMARY_NAV_ITEMS: NavItemConfig[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/founders", label: "Founders" },
  { href: "/invitations", label: "Invitations" },
  // Last, deliberately: a Mentor's own founder-preview sandbox
  // (packages/services/src/mentor/founder-preview.ts) is a minor,
  // optional feature next to covering real Founders — not worth the
  // dashboard real estate it used to occupy.
  { href: "/sandbox", label: "Sandbox" },
];

const ADMIN_PRIMARY_NAV_ITEMS: NavItemConfig[] = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/invitations", label: "Invitations" },
];

export function primaryNavItems(role: NavRole): NavItemConfig[] {
  if (role === "mentor") return MENTOR_PRIMARY_NAV_ITEMS;
  if (role === "admin") return ADMIN_PRIMARY_NAV_ITEMS;
  return FOUNDER_PRIMARY_NAV_ITEMS;
}

const FOUNDER_ACCOUNT_NAV_ITEMS: NavItemConfig[] = [
  { href: "/profile", label: "Your profile" },
  { href: "/account-security", label: "Account security" },
  { href: "/company-profile", label: "Company profile" },
  // Not "MCP connection": MCP is the protocol underneath, and naming it
  // here asked a founder to recognise an acronym to find the page where
  // they connect their assistant. Not the assistant's name either — this
  // label is rendered on every screen from the app shell, which does not
  // know which one they chose, and a label that flipped between products
  // would move under them for no gain.
  { href: "/connection", label: "AI connection" },
];

// A Mentor has a profile and a password like anyone else, but no venture
// (Company profile) and no MCP access (AI connection) — see
// packages/services/src/mcp-auth's founder-only allowlist.
const MENTOR_ACCOUNT_NAV_ITEMS: NavItemConfig[] = [
  { href: "/profile", label: "Your profile" },
  { href: "/account-security", label: "Account security" },
];

// Same account surface Mentors get: profile + password. No company profile
// or AI connection — those are Founder-only concepts.
const ADMIN_ACCOUNT_NAV_ITEMS: NavItemConfig[] = [
  { href: "/admin/profile", label: "Your profile" },
  { href: "/admin/account-security", label: "Account security" },
];

export function accountNavItems(role: NavRole): NavItemConfig[] {
  if (role === "mentor") return MENTOR_ACCOUNT_NAV_ITEMS;
  if (role === "admin") return ADMIN_ACCOUNT_NAV_ITEMS;
  return FOUNDER_ACCOUNT_NAV_ITEMS;
}
