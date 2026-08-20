import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PageShell } from "../../components/page-shell";

export default function ModuleNotFound() {
  return (
    /* Same type scale and button shape as the rest of the app; this page
       was still on the older 0.3em / text-3xl / rounded-full set. */
    <PageShell className="max-w-2xl py-24 text-center">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Module not found
      </p>
      <h1 className="mt-4 font-serif text-2xl font-medium tracking-[-0.01em]">
        This module doesn&apos;t exist
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Check the link, or go back to your modules.
      </p>
      <Button asChild size="lg" className="mt-6">
        <Link href="/modules">Back to modules</Link>
      </Button>
    </PageShell>
  );
}
