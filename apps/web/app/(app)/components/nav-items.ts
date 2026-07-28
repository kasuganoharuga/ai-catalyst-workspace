export type NavItemConfig = {
  href: string;
  label: string;
};

export const PRIMARY_NAV_ITEMS: NavItemConfig[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/modules", label: "Modules" },
  { href: "/artefacts", label: "Artefacts" },
];

export const ACCOUNT_NAV_ITEMS: NavItemConfig[] = [
  { href: "/profile", label: "Your profile" },
  { href: "/company-profile", label: "Company profile" },
  // Not "MCP connection". MCP is the protocol underneath, and naming it
  // here asked a founder to recognise an acronym to find the page where
  // they connect Claude.
  { href: "/connection", label: "Claude connection" },
];
