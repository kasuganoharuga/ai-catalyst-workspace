"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

import { useActiveNavItem } from "../hooks/use-active-nav-item";
import type { NavItem } from "../types";

const NAV_ITEMS: NavItem[] = [
  { href: "/modules", label: "Modules" },
  { href: "/workspace", label: "Workspace" },
];

export function AppSidebarNavigation() {
  return (
    <nav className="flex flex-col gap-1 px-3 py-2">
      {NAV_ITEMS.map((item) => (
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
        "rounded-xl px-3 py-2 text-sm font-medium transition",
        isActive
          ? "bg-stone-950 text-white"
          : "text-stone-700 hover:bg-stone-100 hover:text-stone-950",
      )}
    >
      {item.label}
    </Link>
  );
}
