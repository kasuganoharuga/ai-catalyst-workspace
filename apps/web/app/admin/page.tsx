import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { requireAdminUser } from "@/lib/require-active-user";

export default async function AdminPage() {
  await requireAdminUser();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          Future admin
        </p>
        <h1 className="mt-5 text-5xl font-semibold tracking-tight">
          Internal review tools are reserved for a later platform phase.
        </h1>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">
          This route keeps space for module review, founder artefact review,
          structured data checks, and future investor record workflows without
          adding admin complexity to V1.
        </p>

        <Link
          href="/admin/invitations"
          className="mt-8 inline-block rounded-full border border-border px-6 py-3 text-sm font-semibold text-foreground transition hover:border-foreground"
        >
          Manage Founder invitations →
        </Link>
      </main>
    </div>
  );
}
