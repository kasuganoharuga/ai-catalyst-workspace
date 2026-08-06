import Link from "next/link";

import { Logo } from "@/components/logo";

// Each destination route's own guard (requireFounderUser et al.) handles the
// unauthenticated/pending/wrong-role redirects. "Dashboard" covers both
// Founder and Mentor accounts — that route renders different content per
// role (see app/(app)/dashboard/page.tsx) rather than needing its own link
// here. The public "Downloads" gallery of Skill files was retired; module
// content now reaches the Founder through the AI assistant and artefacts.
const navigation = [
  { href: "/modules", label: "My Modules" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/admin", label: "Admin" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="group">
          <Logo />
        </Link>
        <nav className="flex flex-wrap gap-3 text-sm font-medium text-muted-foreground">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full border border-border px-4 py-2 transition hover:border-foreground hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
