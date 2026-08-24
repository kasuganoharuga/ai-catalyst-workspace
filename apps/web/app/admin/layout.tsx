import type { ReactNode } from "react";
import type { Metadata } from "next";

import { Toaster } from "@/components/ui/toaster";
import { requireAdminUser } from "@/lib/require-active-user";

import { MobileTopBar } from "@/components/nav/mobile-top-bar";
import { SidebarNavigation } from "@/components/nav/sidebar-navigation";
import { SidebarShell } from "@/components/nav/sidebar-shell";
import { UserMenu } from "@/components/nav/user-menu";

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
      <MobileTopBar
        nav={<SidebarNavigation role="admin" orientation="horizontal" />}
        userMenu={
          <UserMenu
            name={displayName}
            email={session.user.email}
            showDetails={false}
            includeAccountLinks
            role="admin"
            side="bottom"
            align="end"
          />
        }
      />
      <SidebarShell
        homeHref="/admin"
        footer={
          <UserMenu
            name={displayName}
            email={session.user.email}
            subtitle="Admin"
            side="top"
            align="start"
          />
        }
      >
        <SidebarNavigation role="admin" />
      </SidebarShell>
      <main className="min-w-0 flex-1">{children}</main>
      <Toaster />
    </div>
  );
}
