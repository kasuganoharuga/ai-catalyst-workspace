import type { ModuleContext } from "@ai-catalyst/shared";

import { RecheckButton } from "../../../components/recheck-button";
import { StatusBadge } from "../../../components/status-badge";
import {
  DECISION_QUESTION_KEYS,
  deriveModuleDisplayStatus,
} from "../../../lib/module-display";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The right-rail "where you're up to" panel: live Run/Attempt/Artifact
 * state for one Module, read fresh from the database on every render so
 * it can never disagree with what just happened in Claude.
 */
export function ModuleRunPanel({ context }: { context: ModuleContext }) {
  const { runModule, activeAttempt, artifacts, questions, resumeQuestionKey } =
    context;
  const display = deriveModuleDisplayStatus(
    runModule.status,
    activeAttempt?.status ?? null,
  );
  const primaryArtifact = artifacts[0] ?? null;
  const savedSubmission = primaryArtifact?.latestSubmission ?? null;

  // Progress counts the core questions only — the decision-stage
  // questions get their own "Your decision" card, and counting them here
  // would contradict the checklist's "n of 6".
  const coreQuestions = questions.filter(
    (q) => !DECISION_QUESTION_KEYS.has(q.questionKey),
  );
  const answeredCount = coreQuestions.filter(
    (q) => q.responseStatus !== null,
  ).length;
  const resumeQuestion =
    resumeQuestionKey !== null
      ? questions.find((q) => q.questionKey === resumeQuestionKey)
      : null;

  return (
    <aside className="space-y-4 rounded-[2rem] border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Where you&apos;re up to
        </h2>
        <StatusBadge status={display} moduleIndex={runModule.sequenceIndex} />
      </div>

      <dl className="text-sm">
        {activeAttempt ? (
          <div className="flex items-center justify-between gap-4 py-2">
            <dt className="text-muted-foreground">Attempt</dt>
            <dd className="font-semibold text-foreground">
              #{activeAttempt.attemptNumber}
              {activeAttempt.attemptType === "retry" ? " (retry)" : ""}
            </dd>
          </div>
        ) : null}
        {coreQuestions.length > 0 ? (
          <div className="flex items-center justify-between gap-4 border-t border-border/60 py-2 first:border-t-0">
            <dt className="text-muted-foreground">Questions answered</dt>
            <dd className="font-semibold text-foreground">
              {answeredCount} of {coreQuestions.length}
            </dd>
          </div>
        ) : null}
        {primaryArtifact ? (
          <div className="flex items-center justify-between gap-4 border-t border-border/60 py-2 first:border-t-0">
            <dt className="text-muted-foreground">{primaryArtifact.name}</dt>
            <dd>
              {savedSubmission ? (
                <StatusBadge
                  status={{
                    label: `Saved · v${savedSubmission.versionNumber}`,
                    tone: "soft",
                  }}
                />
              ) : (
                <span className="text-muted-foreground">Not saved yet</span>
              )}
            </dd>
          </div>
        ) : null}
        {savedSubmission?.submittedAt ? (
          <div className="flex items-center justify-between gap-4 border-t border-border/60 py-2">
            <dt className="text-muted-foreground">Last saved</dt>
            <dd className="text-foreground">
              {formatDateTime(savedSubmission.submittedAt)}
            </dd>
          </div>
        ) : null}
      </dl>

      {resumeQuestion && activeAttempt ? (
        <p className="rounded-2xl bg-muted/60 px-4 py-3 text-sm leading-6 text-muted-foreground">
          <span className="font-semibold text-foreground">Pick up here:</span>
          {` question ${resumeQuestion.sequenceIndex} is next. `}
          Just open Claude and say &ldquo;let&apos;s continue&rdquo; — it
          remembers where you were.
        </p>
      ) : null}

      <RecheckButton className="w-full" />
    </aside>
  );
}
