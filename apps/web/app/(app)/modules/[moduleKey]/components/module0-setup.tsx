"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { confirmModuleCompletionAction } from "@/lib/actions/founder-actions";
import { cn } from "@/lib/utils";

import { ClaudeHandoff } from "../../../components/claude-handoff";
import { useSoftModuleRefresh } from "../../../hooks/use-soft-module-refresh";
import {
  claudeHandoffCopy,
  errorCopy,
  module1Copy,
  toastCopy,
} from "../../../lib/copy";
import { moduleAccentStyle } from "../../../lib/module-display";

type ExpectedArtifact = {
  artifactKey: string;
  name: string;
  requiredFilename: string | null;
  outline: { heading: string; items: string[] }[];
};

type Module0SetupProps = {
  moduleKey: string;
  moduleIndex: number;
  programRunModuleId: string | null;
  claudeProjectId: string | null;
  connected: boolean;
  hasMcpActivity: boolean;
  artifactKey: string | null;
  artifactName: string | null;
  artifactVersion: number | null;
  artifactSavedAt: string | null;
  expectedArtifacts: ExpectedArtifact[];
  awaitingConfirmation: boolean;
  isCompleted: boolean;
  needsRetry: boolean;
  startPrompt: string;
  nextModuleTitle: string | null;
};

/**
 * Module 0 — Claude-first: Continue in Claude, then website Confirm.
 * Project linking is optional elsewhere; not part of this path.
 */
export function Module0Setup(props: Module0SetupProps) {
  const {
    moduleIndex,
    connected,
    awaitingConfirmation,
    isCompleted,
    needsRetry,
  } = props;

  const shouldPoll =
    connected && !awaitingConfirmation && !isCompleted && !needsRetry;

  useSoftModuleRefresh(shouldPoll);

  const steps = [
    {
      label: "Continue in Claude",
      done: awaitingConfirmation || isCompleted,
    },
    { label: "Confirm and unlock", done: isCompleted },
  ];

  const firstIncomplete = steps.findIndex((step) => !step.done);
  const [active, setActive] = useState(
    firstIncomplete === -1 ? steps.length - 1 : firstIncomplete,
  );

  const accent = moduleAccentStyle(moduleIndex);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <ol className="flex divide-x divide-border border-b border-border">
        {steps.map((step, index) => (
          <li key={step.label} className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setActive(index)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-3 text-left transition sm:px-4",
                index === active ? "bg-muted/60" : "hover:bg-muted/30",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold tabular-nums",
                  step.done
                    ? "text-white"
                    : index === active
                      ? "border border-foreground text-foreground"
                      : "border border-border text-muted-foreground",
                )}
                style={step.done ? accent : undefined}
              >
                {step.done ? (
                  <Check
                    aria-hidden="true"
                    className="h-3 w-3"
                    strokeWidth={3}
                  />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={cn(
                  "hidden truncate text-[13px] sm:block",
                  index === active
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="p-6 lg:p-8">
        {active === 0 ? <CheckStep {...props} accent={accent} /> : null}
        {active === 1 ? <ConfirmStep {...props} accent={accent} /> : null}

        <div className="mt-8 flex items-center justify-between gap-4 border-t border-border pt-5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setActive((n) => Math.max(0, n - 1))}
            disabled={active === 0}
          >
            Back
          </Button>
          <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {active + 1} / {steps.length}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setActive((n) => Math.min(steps.length - 1, n + 1))}
            disabled={active === steps.length - 1}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

function StepHeading({
  title,
  body,
}: {
  title: string;
  body: React.ReactNode;
}) {
  return (
    <>
      <h3 className="font-serif text-xl font-medium tracking-[-0.01em] text-foreground">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
    </>
  );
}

function CheckStep({
  connected,
  startPrompt,
  artifactName,
  artifactVersion,
  awaitingConfirmation,
  isCompleted,
  needsRetry,
  accent,
}: Module0SetupProps & { accent: { backgroundColor: string } }) {
  const documentSaved = artifactVersion !== null;

  return (
    <>
      <StepHeading
        title="Let Claude run the check"
        body="Open Claude, send the line below, and let it confirm it can reach your workspace — then write and save your Setup Summary."
      />

      {!connected ? (
        <div className="mt-6 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm leading-6 text-muted-foreground">
          Claude still needs a one-time connector to this workspace before the
          check can save anything.{" "}
          <Link
            href="/connection"
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Set up the connection
          </Link>
          , then come back here.
        </div>
      ) : null}

      <div className="mt-6">
        <ClaudeHandoff
          prompt={startPrompt}
          label={
            needsRetry ? claudeHandoffCopy.retryCta : claudeHandoffCopy.openCta
          }
          accent={accent}
        />
      </div>

      <div className="mt-8">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Progress
        </p>
        <dl className="mt-3 text-sm">
          <CheckLine
            ok={documentSaved}
            label="Setup Summary saved to your workspace"
            detail={
              documentSaved
                ? `${artifactName ?? "Document"} · version ${artifactVersion}`
                : "Nothing saved yet — this page updates when Claude saves."
            }
          />
          <CheckLine
            ok={awaitingConfirmation || isCompleted}
            label="Passed its checks"
            detail={
              awaitingConfirmation || isCompleted
                ? "Ready for you to look over."
                : "Runs automatically once the document is saved."
            }
          />
        </dl>
      </div>
    </>
  );
}

function formatSavedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ConfirmStep({
  moduleKey,
  programRunModuleId,
  artifactKey,
  artifactName,
  artifactVersion,
  artifactSavedAt,
  expectedArtifacts,
  awaitingConfirmation,
  isCompleted,
  nextModuleTitle,
  accent,
}: Module0SetupProps & { accent: { backgroundColor: string } }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const documentSaved = artifactVersion !== null;
  const checksPassed = awaitingConfirmation || isCompleted;
  const expected = expectedArtifacts[0] ?? null;

  function handleConfirm() {
    if (!programRunModuleId) return;
    startTransition(async () => {
      const result = await confirmModuleCompletionAction(programRunModuleId);
      if (!result.ok) {
        toast.error(toastCopy.actionFailedTitle, {
          description: result.message ?? errorCopy.generic,
        });
        return;
      }
      toast.success(toastCopy.moduleConfirmed, {
        description: nextModuleTitle
          ? toastCopy.moduleConfirmedNext(nextModuleTitle)
          : undefined,
      });
      router.refresh();
    });
  }

  return (
    <>
      <StepHeading
        title={
          isCompleted
            ? "Done — and the programme is open"
            : awaitingConfirmation
              ? "Check the file, then unlock the next module"
              : "No file detected yet"
        }
        body={
          isCompleted ? (
            nextModuleTitle ? (
              <>
                You signed this off, which opened{" "}
                <span className="font-medium text-foreground">
                  {nextModuleTitle}
                </span>
                . Everything Module 0 produced stays in your workspace.
              </>
            ) : (
              "You signed this off. Everything Module 0 produced stays in your workspace."
            )
          ) : awaitingConfirmation ? (
            <>
              Read what Claude saved, make sure it matches what this module
              asked for, then confirm. That marks Module 0 done
              {nextModuleTitle ? (
                <>
                  {" "}
                  and opens{" "}
                  <span className="font-medium text-foreground">
                    {nextModuleTitle}
                  </span>
                </>
              ) : null}
              .
            </>
          ) : (
            "We haven't found a Setup Summary in your workspace yet. Once Claude saves it and it passes its checks, this is where you sign it off. Nothing unlocks until you do."
          )
        }
      />

      <div className="mt-6 overflow-hidden rounded-lg border border-border">
        <div className="border-b border-border bg-muted/40 px-4 py-2.5">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            The document
          </p>
        </div>
        <dl className="px-4 py-2 text-sm">
          <CheckLine
            ok={documentSaved}
            label={artifactName ?? expected?.name ?? "Setup Summary"}
            detail={
              documentSaved
                ? `Version ${artifactVersion}${
                    artifactSavedAt
                      ? ` · ${formatSavedAt(artifactSavedAt)}`
                      : ""
                  }`
                : "Not saved yet."
            }
          />
          <CheckLine
            ok={checksPassed}
            label="Passed its checks"
            detail={
              checksPassed
                ? "Ready for you to look over."
                : documentSaved
                  ? "Still running."
                  : "Runs once the file is saved."
            }
          />
        </dl>
        {expected && expected.outline.length > 0 ? (
          <div className="border-t border-border px-4 py-4">
            <p className="text-xs font-medium text-muted-foreground">
              It should cover
            </p>
            <ul className="mt-2 space-y-1">
              {expected.outline.map((section) => (
                <li
                  key={section.heading}
                  className="text-xs leading-5 text-muted-foreground"
                >
                  {section.heading}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {documentSaved && artifactKey ? (
          <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border px-4 py-3 text-xs">
            <Link
              href={`/artefacts/${moduleKey}/${artifactKey}`}
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              Read document
            </Link>
            <a
              href={`/artefacts/${moduleKey}/${artifactKey}/download`}
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              Download
            </a>
          </div>
        ) : null}
      </div>

      {isCompleted ? (
        <div className="mt-6">
          <Button asChild size="lg" className="text-white" style={accent}>
            <Link href="/modules">See your modules</Link>
          </Button>
        </div>
      ) : awaitingConfirmation ? (
        <div className="mt-6">
          <Button
            type="button"
            size="lg"
            className="text-white hover:brightness-110"
            style={accent}
            onClick={handleConfirm}
            disabled={isPending || !programRunModuleId}
          >
            {isPending
              ? "Confirming…"
              : nextModuleTitle
                ? `Confirm and open ${nextModuleTitle}`
                : "Confirm and unlock the next module"}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            {module1Copy.reviseHint}
          </p>
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          Finish the check in Claude first — this page updates when the file
          lands.
        </p>
      )}
    </>
  );
}

function CheckLine({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-border/70 py-3 first:border-t-0">
      <dt className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
            ok ? "bg-primary" : "border border-border",
          )}
        >
          {ok ? (
            <Check
              aria-hidden="true"
              className="h-2.5 w-2.5 text-primary-foreground"
              strokeWidth={3}
            />
          ) : null}
        </span>
        <span className="text-foreground">{label}</span>
      </dt>
      <dd className="max-w-[16rem] text-right text-xs leading-5 text-muted-foreground">
        {detail}
      </dd>
    </div>
  );
}
