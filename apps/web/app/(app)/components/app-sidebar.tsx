import Link from "next/link";

import { Logo } from "@/components/logo";
import type { AppShellUser } from "@/lib/app-shell";

import { AppSidebarNavigation } from "./app-sidebar-navigation";
import { UserMenu } from "./user-menu";

type AppSidebarProps = {
  user: AppShellUser;
};

export function AppSidebar({ user }: AppSidebarProps) {
  return (
    // Sticky full-height column: navigation and the account menu stay
    // reachable no matter how long the page below scrolls.
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <Link href="/dashboard" className="block px-6 py-6">
        <Logo />
      </Link>

      <AppSidebarNavigation />

      <div className="mt-auto border-t border-sidebar-border p-3">
        <UserMenu
          name={user.displayName}
          email={user.email}
          subtitle={user.ventureSubtitle}
          side="top"
          align="start"
        />
      </div>
    </aside>
  );
}
