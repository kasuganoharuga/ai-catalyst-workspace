"use client";

import {
  KeyRound,
  LayoutDashboard,
  Mail,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import {
  ADMIN_ACCOUNT_NAV_ITEMS,
  ADMIN_PRIMARY_NAV_ITEMS,
  type AdminNavItem,
} from "./nav-items";

const ICON_BY_HREF: Record<string, LucideIcon> = {
  "/admin": LayoutDashboard,
  "/admin/users": Users,
  "/admin/invitations": Mail,
  "/admin/profile": UserRound,
  "/admin/account-security": KeyRound,
};

function isActiveNavItem(pathname: string, href: string): boolean {
  // Exact match for /admin so /admin/users does not also light up Dashboard.
  if (href === "/admin") {
    return pathname === "/admin";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function AdminNavLink({
  item,
  compact = false,
  withIcon = false,
}: {
  item: AdminNavItem;
  compact?: boolean;
  withIcon?: boolean;
}) {
  const pathname = usePathname();
  const isActive = isActiveNavItem(pathname, item.href);
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

export function AdminNav({
  orientation = "vertical",
}: {
  orientation?: "vertical" | "horizontal";
}) {
  if (orientation === "horizontal") {
    return (
      <nav className="flex min-w-0 flex-row gap-1 overflow-x-auto">
        {ADMIN_PRIMARY_NAV_ITEMS.map((item) => (
          <AdminNavLink key={item.href} item={item} compact />
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-0.5 px-3 py-2">
      {ADMIN_PRIMARY_NAV_ITEMS.map((item) => (
        <AdminNavLink key={item.href} item={item} withIcon />
      ))}
      <p className="mt-7 px-3 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Account
      </p>
      <div className="mt-1.5 flex flex-col gap-0.5">
        {ADMIN_ACCOUNT_NAV_ITEMS.map((item) => (
          <AdminNavLink key={item.href} item={item} withIcon />
        ))}
      </div>
    </nav>
  );
}
