import { resolveFounderPreviewState } from "@ai-catalyst/services/mentor/founder-preview";

import { appPageTitle } from "@/lib/page-metadata";
import { getCurrentMentorActor } from "@/lib/current-mentor-actor";

import { PageShell } from "../components/page-shell";
import { founderPreviewCopy } from "../lib/copy";
import { EnterFounderPreviewButton } from "./components/enter-founder-preview-button";
import { StartNewSandboxButton } from "./components/start-new-sandbox-button";

export const metadata = appPageTitle("Sandbox");

/**
 * Entry point for a Mentor's own founder-preview sandbox — deliberately
 * its own low-traffic page rather than dashboard real estate, since this
 * is a minor, optional feature next to actually covering Founders. See
 * packages/services/src/mentor/founder-preview.ts.
 */
export default async function SandboxPage() {
  const actor = await getCurrentMentorActor();
  const preview = await resolveFounderPreviewState(actor.userId);

  return (
    <PageShell>
      <div className="max-w-2xl">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Sandbox
        </p>
        <h1 className="mt-4 font-serif text-[2.25rem] font-medium leading-tight tracking-[-0.02em]">
          {founderPreviewCopy.introHeading}
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
          {founderPreviewCopy.introBody}
        </p>
      </div>

      <div className="mt-6 flex flex-col items-start gap-3">
        {preview.hasSandbox ? (
          <>
            <p className="text-sm text-muted-foreground">
              {founderPreviewCopy.introExistingNote}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <EnterFounderPreviewButton
                label={founderPreviewCopy.continueCta}
              />
              <StartNewSandboxButton />
            </div>
          </>
        ) : (
          <EnterFounderPreviewButton />
        )}
      </div>
    </PageShell>
  );
}
