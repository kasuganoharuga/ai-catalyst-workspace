import Link from "next/link";

// "Toolkit Preview" (public, manifest-backed) and "My Modules" (Founder-only,
// database-backed catalog under the (app) route group) are deliberately two
// separate entry points with two separate labels — the destination route's
// own guard (requireFounderUser et al.) handles the unauthenticated/pending/
// wrong-role redirects, the same way it already does for "Workspace" and
// "Admin" below.
const navigation = [
  { href: "/toolkit", label: "Toolkit Preview" },
  { href: "/downloads", label: "Downloads" },
  { href: "/modules", label: "My Modules" },
  { href: "/workspace", label: "Workspace" },
  { href: "/admin", label: "Admin" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-stone-200 bg-stone-50/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="group">
          <span className="block text-xs font-semibold uppercase tracking-[0.34em] text-amber-700">
            AI Catalyst
          </span>
          <span className="text-lg font-semibold tracking-tight text-stone-950">
            Founder Toolkit
          </span>
        </Link>
        <nav className="flex flex-wrap gap-3 text-sm font-medium text-stone-700">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full border border-stone-200 px-4 py-2 transition hover:border-stone-950 hover:text-stone-950"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
