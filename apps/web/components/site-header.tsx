import Link from "next/link";

import { Logo } from "@/components/logo";

// "Toolkit Preview" (public, manifest-backed) and "My Modules" (Founder-only,
// database-backed catalog under the (app) route group) are deliberately two
// separate entry points with two separate labels — the destination route's
// own guard (requireFounderUser et al.) handles the unauthenticated/pending/
// wrong-role redirects, the same way it already does for "Dashboard" and
// "Admin" below.
const navigation = [
  { href: "/toolkit", label: "Toolkit Preview" },
  { href: "/downloads", label: "Downloads" },
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
