"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

import { ACCOUNT_NAV_ITEMS } from "./nav-items";
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
 * Account menu, and the only route out of the session.
 *
 * `includeAccountLinks` tracks which shell is rendering it: the top bar
 * has no room for the account pages so it carries them here, while the
 * sidebar already lists them a few pixels above and would just be
 * repeating itself — there, this is a sign-out menu and nothing else.
 */
export function UserMenu({
  name,
  email,
  subtitle,
  showDetails = true,
  includeAccountLinks = false,
  align = "start",
  side = "top",
}: {
  name: string;
  email: string;
  subtitle?: string | null;
  showDetails?: boolean;
  includeAccountLinks?: boolean;
  align?: "start" | "end";
  side?: "top" | "bottom";
}) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  function handleSignOut() {
    setIsSigningOut(true);
    authClient.signOut({
      fetchOptions: {
        onSuccess: () => router.push("/"),
        onError: () => setIsSigningOut(false),
      },
    });
  }

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
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-[13px] font-semibold text-foreground">
            {name}
          </span>
          <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
            {email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {includeAccountLinks
          ? ACCOUNT_NAV_ITEMS.map((item) => (
              <DropdownMenuItem key={item.href} asChild>
                <Link href={item.href}>
                  <NavMenuIcon href={item.href} />
                  {item.label}
                </Link>
              </DropdownMenuItem>
            ))
          : null}
        {includeAccountLinks ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem
          onSelect={handleSignOut}
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
