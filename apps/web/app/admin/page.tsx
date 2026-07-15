import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { requireActiveUser } from "@/lib/require-active-user";

export default async function AdminPage() {
  await requireActiveUser();

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.34em] text-amber-700">
          Future admin
        </p>
        <h1 className="mt-5 text-5xl font-semibold tracking-[-0.04em]">
          Internal review tools are reserved for a later platform phase.
        </h1>
        <p className="mt-6 text-lg leading-8 text-stone-700">
          This route keeps space for module review, founder artefact review,
          structured data checks, and future investor record workflows without
          adding admin complexity to V1.
        </p>

        <Link
          href="/admin/invitations"
          className="mt-8 inline-block rounded-full border border-stone-300 px-6 py-3 text-sm font-semibold text-stone-950 transition hover:border-stone-950"
        >
          Manage Founder invitations →
        </Link>
      </main>
    </div>
  );
}
