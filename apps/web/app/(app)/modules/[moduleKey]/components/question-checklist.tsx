import type { ModuleContextQuestion } from "@ai-catalyst/shared";

import { cn } from "@/lib/utils";

/**
 * The six core questions with live per-question progress (design frame
 * H6): a tick the moment an answer is confirmed in Claude. Read-only —
 * answering happens in the conversation, never in a web form.
 */
export function QuestionChecklist({
  questions,
}: {
  questions: ModuleContextQuestion[];
}) {
  const answeredCount = questions.filter(
    (q) => q.responseStatus !== null,
  ).length;

  return (
    <div className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          The questions
        </h2>
        <span className="text-xs font-semibold text-muted-foreground">
          {answeredCount} of {questions.length} answered
        </span>
      </div>
      <ol className="mt-5 space-y-3">
        {questions.map((question) => {
          const answered = question.responseStatus !== null;
          return (
            <li key={question.questionKey} className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-bold",
                  answered
                    ? "bg-accent text-accent-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {answered ? "✓" : question.sequenceIndex}
              </span>
              <p
                className={cn(
                  "text-sm leading-6",
                  answered ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {question.questionText}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
