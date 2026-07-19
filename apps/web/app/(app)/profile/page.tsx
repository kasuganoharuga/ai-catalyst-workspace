import type { ReactNode } from "react";

import { formatDate } from "@/lib/format";
import { appPageTitle } from "@/lib/page-metadata";
import { getActiveContext } from "@/lib/active-context";
import {
  getCurrentFounderActor,
  getCurrentFounderSession,
} from "@/lib/current-founder-actor";
import { getMyProfile, resolveDisplayName } from "@/lib/user-profile";
import { ventureForActiveContext } from "@/lib/ventures";
import { getMyWorkspace } from "@/lib/workspace";

import { PageShell } from "../components/page-shell";
import { PasswordSection } from "./components/password-section";
import { ProfileForm } from "./components/profile-form";

export const metadata = appPageTitle("Your profile");

export default async function ProfilePage() {
  const [actor, session] = await Promise.all([
    getCurrentFounderActor(),
    getCurrentFounderSession(),
  ]);

  const activeContextPromise = getActiveContext(actor);
  const [profile, workspace, venture] = await Promise.all([
    getMyProfile(actor),
    getMyWorkspace(actor),
    activeContextPromise.then((context) =>
      ventureForActiveContext(actor, context),
    ),
  ]);

  const displayName = resolveDisplayName(profile, session.user.name);

  return (
    <PageShell className="max-w-2xl">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Your profile
      </p>
      <h1 className="mt-4 font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
        {displayName}
      </h1>
      <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
        How you appear across the programme. Your name here is what the rest of
        the toolkit greets you by.
      </p>

      <ProfileForm profile={profile} />

      <PasswordSection />

      <section className="mt-14">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Account
        </h2>
        <dl className="mt-3 border-t border-border text-sm">
          <Row label="Sign-in email">{session.user.email}</Row>
          <Row label="Role">
            <span className="capitalize">{actor.role}</span>
          </Row>
          <Row label="Joined">{formatDate(session.user.createdAt)}</Row>
          <Row label="Workspace">{workspace.name}</Row>
          <Row label="Current idea">{venture ? venture.name : "None yet"}</Row>
        </dl>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          These are set by your invitation and can&apos;t be changed here. If
          something is wrong, tell your programme lead.
        </p>
      </section>
    </PageShell>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-border py-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-foreground">
        {children}
      </dd>
    </div>
  );
}
