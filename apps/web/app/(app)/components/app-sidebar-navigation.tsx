"use client";

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
  { href: "/dashboard", label: "Dashboard" },
  { href: "/modules", label: "Modules" },
  { href: "/artefacts", label: "Artefacts" },
];

const ACCOUNT_NAV_ITEMS: NavItem[] = [
  { href: "/company-profile", label: "Company profile" },
];

export function AppSidebarNavigation({
  orientation = "vertical",
}: {
  orientation?: "vertical" | "horizontal";
}) {
  if (orientation === "horizontal") {
    return (
      <nav className="flex flex-row gap-1 overflow-x-auto px-1">
        {[...PRIMARY_NAV_ITEMS, ...ACCOUNT_NAV_ITEMS].map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-1 px-3 py-2">
      {PRIMARY_NAV_ITEMS.map((item) => (
        <NavLink key={item.href} item={item} />
      ))}
      <p className="mt-6 px-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Account
      </p>
      {ACCOUNT_NAV_ITEMS.map((item) => (
        <NavLink key={item.href} item={item} />
      ))}
    </nav>
  );
}

function NavLink({ item }: { item: NavItem }) {
  const isActive = useActiveNavItem(item.href);

  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "shrink-0 rounded-xl px-3 py-2 text-sm font-medium transition",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {item.label}
    </Link>
  );
}
