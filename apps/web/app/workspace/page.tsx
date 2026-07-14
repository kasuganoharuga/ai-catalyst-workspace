import { SiteHeader } from "@/components/site-header";
import { requireActiveUser } from "@/lib/require-active-user";

export default async function WorkspacePage() {
  await requireActiveUser();

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.34em] text-amber-700">
          Future workspace
        </p>
        <h1 className="mt-5 text-5xl font-semibold tracking-[-0.04em]">
          Founder workspaces will come after the Skill-first MVP.
        </h1>
        <p className="mt-6 text-lg leading-8 text-stone-700">
          This route reserves the product direction for saved founder context,
          uploaded materials, generated artefacts, module progress, and export
          workflows. V1 keeps the experience lightweight and download-first.
        </p>
      </main>
    </div>
  );
}
