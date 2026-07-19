"use client";

import {
  Building2,
  FileText,
  LayoutDashboard,
  Layers,
  Plug,
  UserRound,
} from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { useActiveNavItem } from "../hooks/use-active-nav-item";
import type { NavItem } from "../types";

// Workspace is deliberately not in the nav: MVP assumes exactly one
// Founder per Workspace and one Venture (Idea) per Founder, both created
// automatically on invitation acceptance, so there is no multi-Venture
// management the user needs to reach day-to-day. The route itself still
// works (e.g. linked from the Dashboard's "no active Venture" fallback).
const PRIMARY_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/modules", label: "Modules", icon: Layers },
  { href: "/artefacts", label: "Artefacts", icon: FileText },
];

// Settings-shaped destinations. The sidebar has room to list them, so it
// does; the top bar folds them into the avatar menu instead.
export const ACCOUNT_NAV_ITEMS: NavItem[] = [
  { href: "/profile", label: "Your profile", icon: UserRound },
  { href: "/company-profile", label: "Company profile", icon: Building2 },
  { href: "/connection", label: "MCP connection", icon: Plug },
];

export function AppSidebarNavigation({
  orientation = "vertical",
}: {
  orientation?: "vertical" | "horizontal";
}) {
  if (orientation === "horizontal") {
    // Primary destinations only, text-only, centred by the header grid —
    // the account pages live in the avatar menu beside this row.
    return (
      <nav className="flex min-w-0 flex-row gap-1 overflow-x-auto">
        {PRIMARY_NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-0.5 px-3 py-2">
      {PRIMARY_NAV_ITEMS.map((item) => (
        <NavLink key={item.href} item={item} withIcon />
      ))}
      <p className="mt-7 px-3 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Account
      </p>
      <div className="mt-1.5 flex flex-col gap-0.5">
        {ACCOUNT_NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} withIcon />
        ))}
      </div>
    </nav>
  );
}

function NavLink({ item, withIcon }: { item: NavItem; withIcon?: boolean }) {
  const isActive = useActiveNavItem(item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition",
        isActive
          ? "bg-secondary text-secondary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {withIcon ? (
        <Icon
          aria-hidden="true"
          className={cn(
            "h-4 w-4 shrink-0",
            isActive ? "text-brand-lime" : "text-muted-foreground",
          )}
        />
      ) : null}
      {item.label}
    </Link>
  );
}
