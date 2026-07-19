import type { ModuleContextQuestion } from "@ai-catalyst/shared";

import { StatusBadge } from "../../../components/status-badge";
import type { ModuleDisplayStatus } from "../../../lib/module-display";

function decisionBadge(decision: string): ModuleDisplayStatus {
  switch (decision) {
    case "proceed":
      return { label: "Proceed", tone: "lime" };
    case "pivot":
      return { label: "Pivot", tone: "warning" };
    case "kill":
      return { label: "Kill", tone: "ink" };
    default:
      return { label: decision, tone: "muted" };
  }
}

/**
 * Shows the Founder's recorded Proceed / Pivot / Kill decisions once
 * they exist (design frame H6d's decision rows). Renders nothing until
 * at least the initial decision has been made in Claude.
 */
export function DecisionCard({
  questions,
}: {
  questions: ModuleContextQuestion[];
}) {
  const byKey = new Map(questions.map((q) => [q.questionKey, q]));
  const initial = byKey.get("initial_decision");
  const final = byKey.get("final_decision");
  const pivotDetail = byKey.get("pivot_detail");

  if (!initial?.answerText && !final?.answerText) {
    return null;
  }

  return (
    <div className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Your decision
      </h2>
      <dl className="mt-4 text-sm">
        {initial?.answerText ? (
          <div className="flex items-center justify-between gap-4 py-2">
            <dt className="text-muted-foreground">First call</dt>
            <dd>
              <StatusBadge status={decisionBadge(initial.answerText)} />
            </dd>
          </div>
        ) : null}
        {final?.answerText ? (
          <div className="flex items-center justify-between gap-4 border-t border-border/60 py-2">
            <dt className="text-muted-foreground">
              After hearing the counter-case
            </dt>
            <dd>
              <StatusBadge status={decisionBadge(final.answerText)} />
            </dd>
          </div>
        ) : null}
      </dl>
      {final?.answerText === "pivot" && pivotDetail?.answerText ? (
        <div className="mt-3 rounded-2xl bg-muted/60 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            What changes
          </p>
          <p className="mt-1 text-sm leading-6 text-foreground">
            {pivotDetail.answerText}
          </p>
        </div>
      ) : null}
      {final?.answerText && initial?.answerText !== final?.answerText ? (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          You changed your mind after seeing the strongest case against you —
          that&apos;s the module working as intended.
        </p>
      ) : null}
    </div>
  );
}
