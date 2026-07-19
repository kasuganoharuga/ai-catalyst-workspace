"use client";

import { usePathname } from "next/navigation";

// A nav item is active on its own page and on any of its nested routes
// (e.g. /modules/module-01-pressure-test still highlights "Modules"),
// without matching an unrelated route that merely shares a text prefix
// (e.g. "/modules-archive").
export function useActiveNavItem(href: string): boolean {
  const pathname = usePathname();
  return pathname === href || pathname.startsWith(`${href}/`);
}
