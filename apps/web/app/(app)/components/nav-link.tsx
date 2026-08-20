"use client";

import {
  Building2,
  FileText,
  KeyRound,
  LayoutDashboard,
  Layers,
  Mail,
  Plug,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { useActiveNavItem } from "../hooks/use-active-nav-item";
import type { NavItemConfig } from "./nav-items";

const ICON_BY_HREF: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/modules": Layers,
  "/artefacts": FileText,
  // Mentor-only nav items — see nav-items.ts's MENTOR_PRIMARY_NAV_ITEMS.
  "/founders": Users,
  "/invitations": Mail,
  "/profile": UserRound,
  // Same icon the dashboard's invitation-password nudge already uses
  // (password-prompt.tsx) — one glyph for "password" everywhere it shows up.
  "/account-security": KeyRound,
  "/company-profile": Building2,
  "/connection": Plug,
  // Admin account pages (UserMenu on the admin mobile header).
  "/admin/profile": UserRound,
  "/admin/account-security": KeyRound,
};

export function NavLink({
  item,
  withIcon = false,
  compact = false,
}: {
  item: NavItemConfig;
  withIcon?: boolean;
  /** Mobile top-bar sizing — full sidebar padding clips the last tab at ~375px. */
  compact?: boolean;
}) {
  const isActive = useActiveNavItem(item.href);
  const Icon = ICON_BY_HREF[item.href];

  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-2.5 rounded-md font-medium transition",
        compact ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm",
        isActive
          ? "bg-secondary text-secondary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {withIcon && Icon ? (
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

export function NavMenuIcon({ href }: { href: string }) {
  const Icon = ICON_BY_HREF[href];
  if (!Icon) return null;
  return <Icon aria-hidden="true" />;
}
