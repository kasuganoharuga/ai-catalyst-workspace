"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSignOut } from "@/lib/use-sign-out";
import { cn } from "@/lib/utils";

import { accountNavItems } from "./nav-items";
import { NavMenuIcon } from "./nav-link";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  // Falls back to the first two characters when the display name is a
  // single token — a bare email local-part, for instance.
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Account menu and sign-out. includeAccountLinks: top bar carries account pages; sidebar omits duplicates.
 * role selects which account links when includeAccountLinks is true (see nav-items.ts).
 */
export function UserMenu({
  name,
  email,
  subtitle,
  showDetails = true,
  includeAccountLinks = false,
  role,
  align = "start",
  side = "top",
}: {
  name: string;
  email: string;
  subtitle?: string | null;
  showDetails?: boolean;
  includeAccountLinks?: boolean;
  role?: "founder" | "mentor";
  align?: "start" | "end";
  side?: "top" | "bottom";
}) {
  const { isSigningOut, signOut } = useSignOut();
  const items = includeAccountLinks && role ? accountNavItems(role) : [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-3 rounded-md text-left outline-none transition focus-visible:ring-1 focus-visible:ring-foreground",
          showDetails
            ? "w-full px-2 py-2 hover:bg-muted"
            : "p-0.5 hover:opacity-80",
        )}
      >
        <Avatar className="h-8 w-8 rounded-md">
          <AvatarFallback className="rounded-md bg-surface-inverse font-mono text-[11px] font-semibold text-brand-lime">
            {initials(name)}
          </AvatarFallback>
        </Avatar>
        {showDetails ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-foreground">
              {name}
            </span>
            {subtitle ? (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {subtitle}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="sr-only">Account menu</span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align={align} side={side} className="w-60">
        <DropdownMenuLabel className="px-2.5 py-2 font-normal">
          <span className="block truncate text-[13px] font-semibold text-foreground">
            {name}
          </span>
          <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
            {email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length > 0
          ? items.map((item) => (
              <DropdownMenuItem key={item.href} asChild>
                <Link href={item.href}>
                  <NavMenuIcon href={item.href} />
                  {item.label}
                </Link>
              </DropdownMenuItem>
            ))
          : null}
        {items.length > 0 ? <DropdownMenuSeparator /> : null}
        {/* Browser session only — MCP disconnect is a separate action. */}
        <DropdownMenuItem
          onSelect={() => void signOut()}
          disabled={isSigningOut}
          variant="destructive"
        >
          <LogOut aria-hidden="true" />
          {isSigningOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
