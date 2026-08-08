"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type {
  InterviewEvidenceStatus,
  InterviewProgress,
  InterviewQuestionSnapshot,
  InterviewRecord,
} from "@ai-catalyst/services/interview";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addInterviewRecordAction,
  completeInterviewRecordAction,
  saveInterviewRecordDraftAction,
} from "@/lib/actions/interview-actions";
import { cn } from "@/lib/utils";

const fieldClass = cn(
  "w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm",
  "outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "disabled:cursor-not-allowed disabled:opacity-60",
);

type Props = {
  activityId: string;
  questions: InterviewQuestionSnapshot[];
  records: InterviewRecord[];
  progress: InterviewProgress;
  evidenceStatus: InterviewEvidenceStatus;
  hasAttempt: boolean;
};

export function InterviewRecordsClient({
  activityId,
  questions,
  records,
  progress,
  evidenceStatus,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(
    records.find((r) => r.status === "draft")?.id ?? records[0]?.id ?? null,
  );

  // Derive the active pill from props when the selection is missing/stale —
  // avoid syncing that choice through an effect (cascading setState).
  const activeRecordId =
    selectedRecordId && records.some((r) => r.id === selectedRecordId)
      ? selectedRecordId
      : (records.find((r) => r.status === "draft")?.id ??
        records[0]?.id ??
        null);
  const active = records.find((r) => r.id === activeRecordId) ?? null;
  const confirmed = evidenceStatus === "confirmed";

  function run(
    action: () => Promise<{ ok: boolean; message?: string; recordId?: string }>,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message ?? "Something went wrong.");
        return;
      }
      if (result.recordId) setSelectedRecordId(result.recordId);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {progress.completedCount}/{progress.recommendedCount} completed
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || confirmed}
            onClick={() =>
              run(async () => addInterviewRecordAction(activityId))
            }
          >
            + Add interview
          </Button>
        </div>

        {records.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center">
            <p className="font-serif text-xl font-medium tracking-[-0.01em]">
              No interviews yet
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Add your first customer interview and capture what they said
              against the questions from Module 3.
            </p>
            <Button
              type="button"
              className="mt-5"
              disabled={pending || confirmed}
              onClick={() =>
                run(async () => addInterviewRecordAction(activityId))
              }
            >
              Add first interview
            </Button>
          </div>
        ) : (
          <>
            <div
              role="tablist"
              aria-label="Interview records"
              className="flex gap-2 overflow-x-auto pb-1"
            >
              {records.map((record) => {
                const selected = record.id === activeRecordId;
                return (
                  <button
                    key={record.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setSelectedRecordId(record.id)}
                    className={cn(
                      "shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition",
                      selected
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                    )}
                  >
                    <span className="font-medium">
                      Interview {record.sequenceIndex}
                    </span>
                    <span
                      className={cn(
                        "ml-2 font-mono text-[10px] uppercase tracking-[0.12em]",
                        selected
                          ? "text-background/70"
                          : "text-muted-foreground",
                      )}
                    >
                      {record.status === "completed" ? "Done" : "Draft"}
                    </span>
                  </button>
                );
              })}
            </div>

            {active ? (
              <InterviewRecordForm
                key={`${active.id}-${active.updatedAt}`}
                record={active}
                questions={questions}
                disabled={pending || confirmed}
                readOnly={confirmed || active.status === "completed"}
                onSaveDraft={(fields) =>
                  run(async () =>
                    saveInterviewRecordDraftAction(active.id, fields),
                  )
                }
                onComplete={(fields) =>
                  run(async () =>
                    completeInterviewRecordAction(active.id, fields),
                  )
                }
              />
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

type FormFields = {
  intervieweeName: string;
  company: string;
  role: string;
  interviewedAt: string | null;
  answers: Record<string, string>;
  keyQuote: string | null;
  currentWorkaround: string | null;
};

function InterviewRecordForm({
  record,
  questions,
  disabled,
  readOnly,
  onSaveDraft,
  onComplete,
}: {
  record: InterviewRecord;
  questions: InterviewQuestionSnapshot[];
  disabled: boolean;
  readOnly: boolean;
  onSaveDraft: (fields: FormFields) => void;
  onComplete: (fields: FormFields) => void;
}) {
  const [intervieweeName, setIntervieweeName] = useState(
    record.intervieweeName,
  );
  const [company, setCompany] = useState(record.company);
  const [role, setRole] = useState(record.role);
  const [interviewedAt, setInterviewedAt] = useState(
    record.interviewedAt ?? "",
  );
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const q of questions) {
      initial[String(q.index)] = record.answers[String(q.index)] ?? "";
    }
    return initial;
  });
  const [keyQuote, setKeyQuote] = useState(record.keyQuote ?? "");
  const [currentWorkaround, setCurrentWorkaround] = useState(
    record.currentWorkaround ?? "",
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  const lockedCompleted = record.status === "completed";

  function fields(): FormFields {
    return {
      intervieweeName,
      company,
      role,
      interviewedAt: interviewedAt.trim() || null,
      answers,
      keyQuote: keyQuote.trim() || null,
      currentWorkaround: currentWorkaround.trim() || null,
    };
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="border-b border-border bg-muted/30 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-xl font-medium tracking-[-0.01em]">
            Interview {record.sequenceIndex}
          </h2>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {lockedCompleted ? "Completed · Locked" : "Draft"}
          </p>
        </div>
      </header>

      <div className="space-y-6 px-5 py-6 sm:px-6">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Who you spoke with
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Interviewee">
              <input
                className={fieldClass}
                value={intervieweeName}
                disabled={disabled || readOnly}
                onChange={(e) => setIntervieweeName(e.target.value)}
              />
            </Field>
            <Field label="Company">
              <input
                className={fieldClass}
                value={company}
                disabled={disabled || readOnly}
                onChange={(e) => setCompany(e.target.value)}
              />
            </Field>
            <Field label="Role">
              <input
                className={fieldClass}
                value={role}
                disabled={disabled || readOnly}
                onChange={(e) => setRole(e.target.value)}
              />
            </Field>
            <Field label="Interview date">
              <input
                type="date"
                className={fieldClass}
                value={interviewedAt}
                disabled={disabled || readOnly}
                onChange={(e) => setInterviewedAt(e.target.value)}
              />
            </Field>
          </div>
        </div>

        <div className="border-t border-border pt-6">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            What they said
          </p>
          <div className="mt-3 space-y-5">
            {questions.map((q) => (
              <Field key={q.index} label={`Q${q.index}. ${q.text}`}>
                <textarea
                  rows={4}
                  className={fieldClass}
                  value={answers[String(q.index)] ?? ""}
                  disabled={disabled || readOnly}
                  onChange={(e) =>
                    setAnswers((prev) => ({
                      ...prev,
                      [String(q.index)]: e.target.value,
                    }))
                  }
                />
              </Field>
            ))}
          </div>
        </div>

        <div className="border-t border-border pt-6">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Notes to keep
          </p>
          <div className="mt-3 space-y-5">
            <Field label="Key quote">
              <textarea
                rows={3}
                className={fieldClass}
                value={keyQuote}
                disabled={disabled || readOnly}
                onChange={(e) => setKeyQuote(e.target.value)}
              />
            </Field>
            <Field label="Current workaround">
              <textarea
                rows={3}
                className={fieldClass}
                value={currentWorkaround}
                disabled={disabled || readOnly}
                onChange={(e) => setCurrentWorkaround(e.target.value)}
              />
            </Field>
          </div>
        </div>
      </div>

      <footer className="border-t border-border bg-muted/20 px-5 py-4 sm:px-6">
        {!readOnly ? (
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => onSaveDraft(fields())}
            >
              Save draft
            </Button>
            <Button
              type="button"
              disabled={disabled}
              onClick={() => setConfirmOpen(true)}
            >
              Complete interview
            </Button>
          </div>
        ) : (
          <p className="text-right text-sm text-muted-foreground">
            {lockedCompleted
              ? "This interview is completed and locked. It cannot be changed."
              : "Evidence is confirmed and locked. Completed interviews cannot be changed."}
          </p>
        )}
      </footer>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete this interview?</DialogTitle>
            <DialogDescription>
              Once completed, this interview is locked and cannot be edited.
              Make sure the answers are accurate before continuing.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => setConfirmOpen(false)}
            >
              Keep editing
            </Button>
            <Button
              type="button"
              disabled={disabled}
              onClick={() => {
                setConfirmOpen(false);
                onComplete(fields());
              }}
            >
              Complete and lock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium leading-snug text-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
