"use client";

import {
  Building2,
  FileText,
  LayoutDashboard,
  Layers,
  Plug,
  UserRound,
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
  "/profile": UserRound,
  "/company-profile": Building2,
  "/connection": Plug,
};

export function NavLink({
  item,
  withIcon = false,
}: {
  item: NavItemConfig;
  withIcon?: boolean;
}) {
  const isActive = useActiveNavItem(item.href);
  const Icon = ICON_BY_HREF[item.href];

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
