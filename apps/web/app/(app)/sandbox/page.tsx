import {
  getFounderSandboxSummary,
  resolveFounderPreviewState,
} from "@ai-catalyst/services/mentor/founder-preview";

import { appPageTitle } from "@/lib/page-metadata";
import { formatDate } from "@/lib/format";
import { getCurrentMentorActor } from "@/lib/current-mentor-actor";

import { PageShell } from "../components/page-shell";
import { Stat } from "../components/stat";
import { founderPreviewCopy, mentorFounderDetailCopy } from "../lib/copy";
import { moduleAccentStyle } from "../lib/module-display";
import { EnterFounderPreviewButton } from "./components/enter-founder-preview-button";
import { FounderJourneyStrip } from "./components/founder-journey-strip";
import { StartNewSandboxButton } from "./components/start-new-sandbox-button";

export const metadata = appPageTitle("Sandbox");

/**
 * Entry point for a Mentor's own founder-preview sandbox. Still deliberately
 * its own low-traffic page rather than dashboard real estate — this is a
 * minor, optional feature next to actually covering Founders — but the card
 * shows the sandbox's real state once one exists, because two unlabelled
 * buttons gave no way to tell a fresh sandbox from six modules of work.
 *
 * The two states are different on purpose. With no sandbox the card pitches
 * what one gets you, using the Founder journey itself (FounderJourneyStrip);
 * once there is one that orientation is spent, so the same card carries
 * progress instead. Both read from getFounderSandboxSummary, which is
 * self-scoped to this Mentor's own sandbox — see the note there on why
 * getMentorFounderDetail cannot serve this page.
 */
export default async function SandboxPage() {
  const actor = await getCurrentMentorActor();
  const [preview, sandbox] = await Promise.all([
    resolveFounderPreviewState(actor.userId),
    getFounderSandboxSummary(actor),
  ]);

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

      <div className="mt-8 max-w-2xl overflow-hidden rounded-xl border border-border bg-card">
        {preview.hasSandbox && sandbox ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-6 py-4">
              <p className="text-[15px] font-semibold text-foreground">
                {sandbox.workspaceName}
              </p>
              <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {founderPreviewCopy.startedPrefix}{" "}
                {formatDate(sandbox.createdAt)}
              </p>
            </div>

            {sandbox.totalModules === null ? (
              <p className="px-6 py-5 text-sm leading-6 text-muted-foreground">
                {founderPreviewCopy.notStartedNote}
              </p>
            ) : (
              <>
                {/* Stat, but not StatRow: that wrapper bakes in mt-12 and
                    its own top/bottom rules for a full-width page section,
                    which reads as a gap inside a card. The number treatment
                    is the part worth sharing. */}
                <div className="grid grid-cols-1 divide-y divide-border px-6 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                  <Stat
                    value={`${sandbox.completedModules ?? 0}`}
                    suffix={`/${sandbox.totalModules}`}
                  >
                    {mentorFounderDetailCopy.statModules}
                  </Stat>
                  <Stat value={`${sandbox.artefactCount}`}>
                    {mentorFounderDetailCopy.statArtefacts}
                  </Stat>
                  <Stat
                    value={
                      sandbox.lastCompletedAt
                        ? formatDate(sandbox.lastCompletedAt)
                        : mentorFounderDetailCopy.never
                    }
                  >
                    {mentorFounderDetailCopy.statLastActivity}
                  </Stat>
                </div>

                {sandbox.nextModule ? (
                  <div className="flex items-center gap-3 border-t border-border px-6 py-4">
                    <span
                      aria-hidden="true"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-medium tabular-nums text-white"
                      style={moduleAccentStyle(
                        sandbox.nextModule.sequenceIndex,
                      )}
                    >
                      {String(sandbox.nextModule.sequenceIndex).padStart(
                        2,
                        "0",
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        {founderPreviewCopy.upNextLabel}
                      </p>
                      <p className="truncate text-sm text-foreground">
                        {sandbox.nextModule.title}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="border-t border-border px-6 py-4 text-sm text-muted-foreground">
                    {founderPreviewCopy.allModulesCompleteNote}
                  </p>
                )}
              </>
            )}

            <div className="flex flex-wrap items-center gap-3 border-t border-border px-6 py-4">
              <EnterFounderPreviewButton
                label={founderPreviewCopy.continueCta}
              />
              {/* Hidden, not disabled, while there is no active Run
                  (sandbox.totalModules === null): "start a new sandbox"
                  demotes this one and warns about losing what's in it, but
                  with no Run there is nothing to lose — continuing lands on
                  the same empty state a fresh sandbox would, without the
                  dormant Workspace row. Restarting from the preview banner
                  is exactly how a sandbox ends up here with nothing active,
                  so this is not just the first-ever-visit case. */}
              {sandbox.totalModules !== null ? <StartNewSandboxButton /> : null}
            </div>
          </>
        ) : (
          <>
            <div className="border-b border-border p-6">
              <FounderJourneyStrip />
            </div>
            <div className="p-6">
              <p className="text-[15px] font-semibold text-foreground">
                {founderPreviewCopy.emptyTitle}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {founderPreviewCopy.emptyBody}
              </p>
              <div className="mt-5">
                <EnterFounderPreviewButton />
              </div>
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}
