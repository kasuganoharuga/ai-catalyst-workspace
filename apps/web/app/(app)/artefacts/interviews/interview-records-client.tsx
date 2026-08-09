"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type {
  InterviewEvidenceStatus,
  InterviewProgress,
  InterviewQuestionSnapshot,
  InterviewRecord,
} from "@ai-catalyst/services/interview/types";
import { INTERVIEW_MINIMUM_COUNT } from "@ai-catalyst/services/interview/types";

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
  reopenInterviewRecordAction,
  saveInterviewRecordDraftAction,
  submitInterviewSetForReviewAction,
} from "@/lib/actions/interview-actions";
import { cn } from "@/lib/utils";

const MODULE_4_HREF = "/modules/module-04-evidence-of-unmet-need";

const fieldClass = cn(
  "w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm",
  "outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "disabled:cursor-not-allowed disabled:opacity-60",
);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Props = {
  activityId: string;
  programRunId: string;
  questions: InterviewQuestionSnapshot[];
  records: InterviewRecord[];
  progress: InterviewProgress;
  evidenceStatus: InterviewEvidenceStatus;
};

export function InterviewRecordsClient({
  activityId,
  programRunId,
  questions,
  records,
  progress,
  evidenceStatus,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
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
  const submitted = evidenceStatus === "submitted";
  const draftRecords = records.filter((r) => r.status === "draft");
  const canSubmitInterviews =
    progress.completedCount >= INTERVIEW_MINIMUM_COUNT &&
    draftRecords.length === 0;

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

  function submitForReview() {
    setError(null);
    setSubmitOpen(false);
    startTransition(async () => {
      const result = await submitInterviewSetForReviewAction(programRunId);
      if (!result.ok) {
        setError(result.message ?? "Something went wrong.");
        return;
      }
      router.push(MODULE_4_HREF);
      router.refresh();
    });
  }

  const statusLabel = confirmed
    ? " · Evidence confirmed"
    : submitted
      ? " · Submitted for review"
      : "";

  const submitHint = confirmed
    ? "Evidence is confirmed on Proof. Reopen evidence there if you need to change interviews."
    : submitted
      ? "Submitted for evidence review on Proof. You can still edit interviews before confirming."
      : progress.completedCount < INTERVIEW_MINIMUM_COUNT
        ? `Complete all ${INTERVIEW_MINIMUM_COUNT} interviews before submitting.`
        : draftRecords.length > 0
          ? `Finish every draft first: ${draftRecords
              .map((r) => `Interview ${r.sequenceIndex}`)
              .join(", ")}.`
          : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {progress.completedCount} of {INTERVIEW_MINIMUM_COUNT} interviews
              completed
              {statusLabel}
            </p>
            {submitHint ? (
              <p className="text-xs text-muted-foreground">{submitHint}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            {confirmed ? (
              <Button type="button" size="sm" disabled>
                Evidence confirmed
              </Button>
            ) : submitted ? (
              <Button type="button" size="sm" asChild>
                <Link href={MODULE_4_HREF}>Review on Proof</Link>
              </Button>
            ) : canSubmitInterviews ? (
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() => setSubmitOpen(true)}
              >
                Submit interviews
              </Button>
            ) : (
              <Button type="button" size="sm" disabled>
                Submit interviews
              </Button>
            )}
          </div>
        </div>

        <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Submit these interviews for evidence review?
              </DialogTitle>
              <DialogDescription>
                You can still correct them before confirming the evidence. Once
                the evidence is confirmed and used in Module 4, this set will be
                locked for that attempt.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setSubmitOpen(false)}
              >
                Keep editing
              </Button>
              <Button
                type="button"
                disabled={pending}
                onClick={submitForReview}
              >
                Submit interviews
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {records.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center">
            <p className="font-serif text-xl font-medium tracking-[-0.01em]">
              No interviews yet
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Add your first customer interview and capture what they said
              against the questions from Module 3. Complete all{" "}
              {INTERVIEW_MINIMUM_COUNT} interviews, then submit them for review
              on Proof.
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
                      {record.status === "completed" ? "Completed" : "Draft"}
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
                evidenceConfirmed={confirmed}
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
                onEdit={() =>
                  run(async () => reopenInterviewRecordAction(active.id))
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

function validateCompleteFields(
  fields: FormFields,
  questions: InterviewQuestionSnapshot[],
): string[] {
  const errors: string[] = [];
  if (!fields.intervieweeName.trim()) errors.push("Interviewee is required.");
  if (!fields.company.trim()) errors.push("Company is required.");
  if (!fields.role.trim()) errors.push("Role is required.");
  if (!fields.interviewedAt || !ISO_DATE.test(fields.interviewedAt)) {
    errors.push("Interview date is required as YYYY-MM-DD.");
  }
  for (const q of questions) {
    const answer = fields.answers[String(q.index)]?.trim() ?? "";
    if (!answer) errors.push(`Answer for Q${q.index} is required.`);
  }
  return errors;
}

function InterviewRecordForm({
  record,
  questions,
  disabled,
  evidenceConfirmed,
  onSaveDraft,
  onComplete,
  onEdit,
}: {
  record: InterviewRecord;
  questions: InterviewQuestionSnapshot[];
  disabled: boolean;
  evidenceConfirmed: boolean;
  onSaveDraft: (fields: FormFields) => void;
  onComplete: (fields: FormFields) => void;
  onEdit: () => void;
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
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const isCompleted = record.status === "completed";
  const readOnly = isCompleted || evidenceConfirmed;
  const interviewLabel = `Interview ${record.sequenceIndex}`;

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

  function tryComplete() {
    const errors = validateCompleteFields(fields(), questions);
    setValidationErrors(errors);
    if (errors.length > 0) return;
    setConfirmOpen(true);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="border-b border-border bg-muted/30 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-xl font-medium tracking-[-0.01em]">
            {interviewLabel}
          </h2>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {isCompleted ? "Completed" : "Draft"}
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
              {/* type="date" follows OS locale (e.g. mixed "yyyy / mm / 日"). */}
              <input
                type="text"
                inputMode="numeric"
                lang="en"
                autoComplete="off"
                placeholder="YYYY-MM-DD"
                pattern="\d{4}-\d{2}-\d{2}"
                maxLength={10}
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
            <Field label="Key quote (optional)">
              <textarea
                rows={3}
                className={fieldClass}
                value={keyQuote}
                disabled={disabled || readOnly}
                onChange={(e) => setKeyQuote(e.target.value)}
              />
            </Field>
            <Field label="Current workaround (optional)">
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

      <footer className="space-y-3 border-t border-border bg-muted/20 px-5 py-4 sm:px-6">
        {!readOnly ? (
          <>
            {validationErrors.length > 0 ? (
              <ul className="space-y-1 text-sm text-destructive">
                {validationErrors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => {
                  setValidationErrors([]);
                  onSaveDraft(fields());
                }}
              >
                Save draft
              </Button>
              <Button type="button" disabled={disabled} onClick={tryComplete}>
                Complete interview
              </Button>
            </div>
          </>
        ) : isCompleted && !evidenceConfirmed ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              This interview is complete. You can still edit it before
              submitting all interviews.
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={onEdit}
            >
              Edit interview
            </Button>
          </div>
        ) : (
          <p className="text-right text-sm text-muted-foreground">
            Evidence is confirmed. Completed interviews cannot be changed.
          </p>
        )}
      </footer>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete this interview?</DialogTitle>
            <DialogDescription>
              Marks {interviewLabel} as finished for the count toward{" "}
              {INTERVIEW_MINIMUM_COUNT}. You can edit it again before submitting
              all interviews.
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
              Complete interview
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
