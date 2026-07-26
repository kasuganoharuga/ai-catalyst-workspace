"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { PageShell } from "./components/page-shell";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageShell className="max-w-lg py-24 text-center">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Something went wrong
      </p>
      <h1 className="mt-4 font-serif text-2xl font-medium tracking-[-0.01em]">
        We couldn&apos;t load this page
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Try again. Your saved work is safe either way.
      </p>
      <Button type="button" size="lg" className="mt-6" onClick={reset}>
        Try again
      </Button>
    </PageShell>
  );
}
