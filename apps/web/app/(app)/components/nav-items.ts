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
