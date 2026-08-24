"use client";

import { usePathname } from "next/navigation";

// A nav item is active on its own page and on any of its nested routes
// (e.g. /modules/module-01-pressure-test still highlights "Modules"),
// without matching an unrelated route that merely shares a text prefix
// (e.g. "/modules-archive"). `exact` disables the nested-route match —
// only "/admin" needs it, so "/admin/users" doesn't also light up
// "Dashboard".
export function isActiveNavPath(
  pathname: string,
  href: string,
  exact = false,
): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function useActiveNavItem(href: string, exact = false): boolean {
  const pathname = usePathname();
  return isActiveNavPath(pathname, href, exact);
}
