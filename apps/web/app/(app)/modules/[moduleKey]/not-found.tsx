import Link from "next/link";

export default function ModuleNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.34em] text-amber-700">
        Module not found
      </p>
      <h1 className="mt-5 text-3xl font-semibold tracking-[-0.04em]">
        This module doesn&apos;t exist.
      </h1>
      <p className="mt-4 text-base leading-7 text-stone-700">
        Check the link, or head back to your modules list.
      </p>
      <Link
        href="/modules"
        className="mt-8 inline-block rounded-full bg-stone-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-800"
      >
        Back to modules
      </Link>
    </main>
  );
}
