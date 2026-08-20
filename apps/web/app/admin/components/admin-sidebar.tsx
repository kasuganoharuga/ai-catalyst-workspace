import Link from "next/link";

import { Logo } from "@/components/logo";
import { UserMenu } from "@/app/(app)/components/user-menu";

import { AdminNav } from "./admin-nav";

export function AdminSidebar({
  displayName,
  email,
}: {
  displayName: string;
  email: string;
}) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <Link href="/admin" className="block px-6 py-6">
        <Logo />
      </Link>

      <AdminNav />

      <div className="mt-auto border-t border-sidebar-border p-3">
        <UserMenu
          name={displayName}
          email={email}
          subtitle="Admin"
          side="top"
          align="start"
        />
      </div>
    </aside>
  );
}
