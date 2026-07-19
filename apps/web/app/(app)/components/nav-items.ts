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
  { href: "/connection", label: "MCP connection" },
];
