import type { ReactNode } from "react";
import type { Metadata } from "next";

import { Logo } from "@/components/logo";
import { Toaster } from "@/components/ui/toaster";
import { UserMenu } from "@/app/(app)/components/user-menu";
import { requireAdminUser } from "@/lib/require-active-user";

import { AdminNav } from "./components/admin-nav";
import { AdminSidebar } from "./components/admin-sidebar";
import { ADMIN_ACCOUNT_NAV_ITEMS } from "./components/nav-items";

export const metadata: Metadata = {
  title: {
    template: "%s · AI Catalyst",
    default: "Admin",
  },
};

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireAdminUser();
  const displayName = session.user.name?.trim() || session.user.email;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground lg:flex-row">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-border px-4 py-2.5 lg:hidden">
        <Logo variant="compact" className="min-w-8 shrink-0" />
        <AdminNav orientation="horizontal" />
        <div className="justify-self-end">
          <UserMenu
            name={displayName}
            email={session.user.email}
            showDetails={false}
            includeAccountLinks
            accountItems={ADMIN_ACCOUNT_NAV_ITEMS}
            side="bottom"
            align="end"
          />
        </div>
      </header>
      <AdminSidebar displayName={displayName} email={session.user.email} />
      <main className="min-w-0 flex-1">{children}</main>
      <Toaster />
    </div>
  );
}
