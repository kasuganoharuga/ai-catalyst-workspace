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
 * Shows the Founder's recorded Proceed / Pivot / Kill decision once it
 * exists. Prefers `founder_decision` (current Module 1); falls back to
 * legacy draft keys (`initial_decision` / `final_decision`) if present.
 */
export function DecisionCard({
  questions,
}: {
  questions: ModuleContextQuestion[];
}) {
  const byKey = new Map(questions.map((q) => [q.questionKey, q]));
  const founder = byKey.get("founder_decision");
  const initial = byKey.get("initial_decision");
  const final = byKey.get("final_decision");
  const pivotDetail = byKey.get("pivot_detail");

  const decision =
    founder?.answerText ?? final?.answerText ?? initial?.answerText ?? null;

  if (!decision) {
    return null;
  }

  return (
    <div className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Your decision
      </h2>
      <dl className="mt-4 text-sm">
        {founder?.answerText ? (
          <div className="flex items-center justify-between gap-4 py-2">
            <dt className="text-muted-foreground">Founder decision</dt>
            <dd>
              <StatusBadge status={decisionBadge(founder.answerText)} />
            </dd>
          </div>
        ) : null}
        {!founder?.answerText && initial?.answerText ? (
          <div className="flex items-center justify-between gap-4 py-2">
            <dt className="text-muted-foreground">First call</dt>
            <dd>
              <StatusBadge status={decisionBadge(initial.answerText)} />
            </dd>
          </div>
        ) : null}
        {!founder?.answerText && final?.answerText ? (
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
      {decision === "pivot" && pivotDetail?.answerText ? (
        <div className="mt-3 rounded-2xl bg-muted/60 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            What changes
          </p>
          <p className="mt-1 text-sm leading-6 text-foreground">
            {pivotDetail.answerText}
          </p>
        </div>
      ) : null}
    </div>
  );
}
