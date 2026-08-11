export type NavItemConfig = {
  href: string;
  label: string;
};

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
  { href: "/founders", label: "My founders" },
  { href: "/invitations", label: "Invitations" },
];

export function primaryNavItems(role: "founder" | "mentor"): NavItemConfig[] {
  return role === "mentor"
    ? MENTOR_PRIMARY_NAV_ITEMS
    : FOUNDER_PRIMARY_NAV_ITEMS;
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

export function accountNavItems(role: "founder" | "mentor"): NavItemConfig[] {
  return role === "mentor"
    ? MENTOR_ACCOUNT_NAV_ITEMS
    : FOUNDER_ACCOUNT_NAV_ITEMS;
}
