import {
  buildEvidencePreview,
  getInterviewActivityForProgramRun,
  getInterviewProgress,
} from "@ai-catalyst/services/interview";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import { MarkdownDocument } from "../../../../components/markdown-document";
import type { Module1RunProps } from "../../types";
import { Module4EvidenceClient } from "./module4-evidence-client";

type Module4EvidencePanelProps = Module1RunProps & {
  actor: ActorContext;
  programRunId: string;
};

/** Machine provenance comments stay in storage; founders see the readable body. */
function founderFacingMarkdown(markdown: string): string {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function Module4EvidencePanel({
  actor,
  programRunId,
  ...runProps
}: Module4EvidencePanelProps) {
  const activity = await getInterviewActivityForProgramRun(actor, programRunId);
  if (!activity) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm leading-6 text-muted-foreground">
        Interview activity is not ready yet. Confirm Module 3 on the website
        first so your interview questions can be snapshotted.
      </div>
    );
  }

  const [progress, preview] = await Promise.all([
    getInterviewProgress(actor, programRunId),
    buildEvidencePreview(actor, programRunId),
  ]);

  const previewMarkdown = preview?.markdown
    ? founderFacingMarkdown(preview.markdown)
    : "";

  return (
    <Module4EvidenceClient
      {...runProps}
      programRunId={programRunId}
      progress={
        progress ?? {
          completedCount: 0,
          recommendedCount: 5,
          requirementMet: false,
          evidenceStatus: activity.evidenceStatus,
          draftCount: 0,
          totalCount: 0,
        }
      }
      evidenceStatus={activity.evidenceStatus}
      previewDocument={
        previewMarkdown ? (
          <MarkdownDocument
            content={previewMarkdown}
            className="px-4 py-4 sm:px-5 sm:py-5"
          />
        ) : null
      }
    />
  );
}
