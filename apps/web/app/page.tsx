import { Lock } from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import type { ActorRole } from "@ai-catalyst/contracts/actor-context";

import { SignInBenefitsPanel } from "@/components/auth/sign-in-benefits-panel";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Logo } from "@/components/logo";
import { actorContextFromSession } from "@/lib/actor-context";
import { auth } from "@/lib/auth";
import { safeReturnTo } from "@/lib/safe-return-to";

type HomePageProps = {
  searchParams: Promise<{ returnTo?: string | string[] }>;
};

const ROLE_DESTINATION: Record<ActorRole, string> = {
  founder: "/dashboard",
  admin: "/admin",
  pending: "/pending",
  mentor: "/toolkit",
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const [session, { returnTo }] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    searchParams,
  ]);
  const safeTo = safeReturnTo(returnTo);

  if (session) {
    // Better Auth's session type widens `role` to `string`, so this cannot
    // be a plain `as ActorRole` cast — an unrecognized value must be
    // treated as unauthenticated, not silently redirected to /toolkit.
    // (actorContextFromSession throws rather than returning a nullable, so
    // it's called outside the redirect() calls below: redirect() works by
    // throwing internally, and wrapping it in this try would swallow that.)
    let role: ActorRole | null = null;
    try {
      role = actorContextFromSession(session).role;
    } catch {
      role = null;
    }

    if (safeTo) {
      redirect(safeTo);
    }
    if (role) {
      redirect(ROLE_DESTINATION[role]);
    }
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <div className="flex flex-1 flex-col justify-center px-6 py-16 sm:px-12 lg:px-20">
        <div className="mx-auto w-full max-w-md">
          <Logo priority />
          <h1 className="mt-10 text-4xl font-semibold tracking-tight">
            Enter your workspace
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Access your toolkit modules, track your progress, and review your
            outputs. Invite-only.
          </p>

          <SignInForm returnTo={safeTo} />

          <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
            <Lock aria-hidden="true" className="h-3.5 w-3.5" />
            Access is granted per cohort — this is not a public download page.
          </p>
        </div>
      </div>
      <SignInBenefitsPanel />
    </div>
  );
}
