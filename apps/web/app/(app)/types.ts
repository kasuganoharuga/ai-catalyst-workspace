import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  // Rendered in the sidebar only — the top bar keeps its three links as
  // plain text so they stay compact and centred.
  icon: LucideIcon;
}
