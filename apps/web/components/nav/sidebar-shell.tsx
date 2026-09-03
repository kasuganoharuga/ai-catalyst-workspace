import type { ReactNode } from "react";
import Link from "next/link";

import { Logo } from "@/components/logo";

export function SidebarShell({
  homeHref,
  children,
  footer,
}: {
  homeHref: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    // Sticky full-height column: navigation and the account menu stay
    // reachable no matter how long the page below scrolls.
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <Link href={homeHref} className="block px-6 py-6">
        <Logo />
      </Link>

      {children}

      <div className="mt-auto border-t border-sidebar-border p-3">{footer}</div>
    </aside>
  );
}
