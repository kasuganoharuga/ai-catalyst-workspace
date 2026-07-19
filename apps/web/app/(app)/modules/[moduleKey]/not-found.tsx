import Link from "next/link";

import { PageShell } from "../../components/page-shell";

export default function ModuleNotFound() {
  return (
    <PageShell className="max-w-2xl py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
        Module not found
      </p>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight">
        This module doesn&apos;t exist.
      </h1>
      <p className="mt-4 text-base leading-7 text-muted-foreground">
        Check the link, or head back to your modules list.
      </p>
      <Link
        href="/modules"
        className="mt-8 inline-block rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-95"
      >
        Back to modules
      </Link>
    </PageShell>
  );
}
