import Link from "next/link";

export default function CompanyProfilePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
        Company profile
      </p>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight">
        Coming soon
      </h1>
      <p className="mt-4 text-base leading-7 text-muted-foreground">
        Once your Venture is further along, you&apos;ll be able to capture and
        edit its company profile here.
      </p>
      <Link
        href="/dashboard"
        className="mt-8 inline-block rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-95"
      >
        Back to dashboard
      </Link>
    </main>
  );
}
