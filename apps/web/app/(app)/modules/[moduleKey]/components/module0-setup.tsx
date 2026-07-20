"use client";

import { Check, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  confirmModuleCompletionAction,
  updateVentureClaudeProjectAction,
} from "@/lib/actions/founder-actions";
import { cn } from "@/lib/utils";

import { CopyButton } from "../../../components/copy-button";
import {
  claudeChatProjectWebUrl,
  claudeProjectInstructions,
  extractClaudeProjectId,
  moduleAccentStyle,
} from "../../../lib/module-display";

type ExpectedArtifact = {
  artifactKey: string;
  name: string;
  requiredFilename: string | null;
  outline: { heading: string; items: string[] }[];
};

type Module0SetupProps = {
  moduleIndex: number;
  programRunModuleId: string | null;
  ventureId: string | null;
  claudeProjectId: string | null;
  connected: boolean;
  hasMcpActivity: boolean;
  artifactName: string | null;
  artifactVersion: number | null;
  artifactSavedAt: string | null;
  expectedArtifacts: ExpectedArtifact[];
  awaitingConfirmation: boolean;
  isCompleted: boolean;
  startPrompt: string;
  nextModuleTitle: string | null;
};

/**
 * Module 0 as four cards rather than one long page.
 *
 * Setup is the only place a Founder has to do things in a specific order
 * across two apps, and a single wall of instructions makes it impossible
 * to tell what to do *now*. One card at a time keeps the current action
 * unambiguous, while the rail above still shows the whole shape and what
 * is already behind them.
 */
export function Module0Setup(props: Module0SetupProps) {
  const {
    moduleIndex,
    claudeProjectId,
    connected,
    hasMcpActivity,
    isCompleted,
  } = props;

  const projectLinked = Boolean(claudeProjectId?.trim());
  const checksRun = props.awaitingConfirmation || isCompleted || hasMcpActivity;

  const steps = [
    { label: "Create project", done: projectLinked },
    { label: "Paste project URL", done: projectLinked },
    { label: "Run the check", done: checksRun },
    { label: "Confirm and unlock", done: isCompleted },
  ];

  // Open on the first thing still outstanding, so the card on screen is
  // the one that needs doing.
  const firstIncomplete = steps.findIndex((step) => !step.done);
  const [active, setActive] = useState(
    firstIncomplete === -1 ? steps.length - 1 : firstIncomplete,
  );

  const accent = moduleAccentStyle(moduleIndex);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Rail: whole shape at a glance, jump anywhere */}
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
        {active === 0 ? <ProjectStep /> : null}
        {active === 1 ? <ProjectUrlStep {...props} /> : null}
        {active === 2 ? <CheckStep {...props} accent={accent} /> : null}
        {active === 3 ? <ConfirmStep {...props} accent={accent} /> : null}

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

function ProjectStep() {
  const instructions = claudeProjectInstructions();

  return (
    <>
      <StepHeading
        title="Create a Claude project for this programme"
        body="A project keeps the same instructions on every chat, so later modules never start from scratch. When you create it, you can set the name and Instructions in the same screen."
      />

      <ol className="mt-6 space-y-3 text-sm leading-6 text-muted-foreground">
        <li className="flex gap-3">
          <span className="w-5 shrink-0 font-mono text-xs tabular-nums text-muted-foreground/70">
            1.
          </span>
          <span>
            Open{" "}
            <a
              href="https://claude.ai"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              claude.ai
            </a>{" "}
            and sign in.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="w-5 shrink-0 font-mono text-xs tabular-nums text-muted-foreground/70">
            2.
          </span>
          <span>
            Start a new{" "}
            <span className="font-medium text-foreground">Project</span> (not a
            plain chat). In that create screen, give it a name — for example{" "}
            <span className="font-medium text-foreground">AI Catalyst</span> —
            and paste the Instructions below into the instructions field. Save.
          </span>
        </li>
      </ol>

      <div className="mt-8">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Copy into Instructions
        </p>
        <div className="mt-3 rounded-md border border-border bg-muted/40 p-4">
          <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap font-mono text-[11.5px] leading-5 text-foreground">
            {instructions}
          </pre>
        </div>
        <div className="mt-3">
          <CopyButton value={instructions} label="Copy instructions" />
        </div>
      </div>
    </>
  );
}

function ProjectUrlStep({ ventureId, claudeProjectId }: Module0SetupProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(claudeProjectId ?? "");
  const [saved, setSaved] = useState(claudeProjectId ?? "");
  const [error, setError] = useState<string | null>(null);

  const isDirty = value.trim() !== saved.trim();

  function handleSave() {
    if (!ventureId) return;
    setError(null);

    const trimmed = value.trim();
    // Clearing the field is a legitimate action; anything else has to
    // contain an id we can actually store.
    const projectId = trimmed === "" ? null : extractClaudeProjectId(trimmed);
    if (trimmed !== "" && projectId === null) {
      setError(
        "That doesn't look like a project link. Paste the address from your browser while the project is open.",
      );
      return;
    }

    startTransition(async () => {
      const result = await updateVentureClaudeProjectAction(
        ventureId,
        projectId,
      );
      if (!result.ok) {
        setError(result.message ?? "That didn't save. Try again in a moment.");
        return;
      }
      setSaved(projectId ?? "");
      setValue(projectId ?? "");
      router.refresh();
    });
  }

  return (
    <>
      <StepHeading
        title="Log in on the web and copy the project URL"
        body="Claude on the web is where the project lives. Open it there, copy the address, and save it here so every “Open in Claude” button lands in the right place."
      />

      <ol className="mt-6 space-y-3 text-sm leading-6 text-muted-foreground">
        <li className="flex gap-3">
          <span className="w-5 shrink-0 font-mono text-xs tabular-nums text-muted-foreground/70">
            1.
          </span>
          <span>
            In your browser, go to{" "}
            <a
              href="https://claude.ai"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              claude.ai
            </a>{" "}
            and sign in if you aren&apos;t already.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="w-5 shrink-0 font-mono text-xs tabular-nums text-muted-foreground/70">
            2.
          </span>
          <span>Open the project you created in the previous step.</span>
        </li>
        <li className="flex gap-3">
          <span className="w-5 shrink-0 font-mono text-xs tabular-nums text-muted-foreground/70">
            3.
          </span>
          <span>
            Copy the full address from the browser bar — it should look like{" "}
            <span className="font-mono text-xs text-foreground">
              https://claude.ai/project/…
            </span>
            .
          </span>
        </li>
        <li className="flex gap-3">
          <span className="w-5 shrink-0 font-mono text-xs tabular-nums text-muted-foreground/70">
            4.
          </span>
          <span>Paste it below and save.</span>
        </li>
      </ol>

      <div className="mt-8">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Project URL
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={value}
            placeholder="https://claude.ai/project/…"
            onChange={(event) => setValue(event.target.value)}
            className="h-10 min-w-0 flex-1 rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-foreground focus:ring-1 focus:ring-foreground"
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleSave}
            disabled={!ventureId || !isDirty || isPending}
          >
            {isPending ? "Saving…" : "Save link"}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {saved.trim() ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Saved — your project is linked to this venture.
          </p>
        ) : null}
      </div>
    </>
  );
}

function CheckStep({
  claudeProjectId,
  connected,
  startPrompt,
  artifactName,
  artifactVersion,
  awaitingConfirmation,
  isCompleted,
  accent,
}: Module0SetupProps & { accent: { backgroundColor: string } }) {
  const documentSaved = artifactVersion !== null;
  const openUrl = claudeProjectId?.trim()
    ? claudeChatProjectWebUrl(claudeProjectId.trim())
    : null;

  return (
    <>
      <StepHeading
        title="Let Claude run the check"
        body="Open a chat inside your project and send the line below. Claude will confirm it can reach your workspace, then write and save your Setup Summary."
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

      <div className="mt-6 overflow-hidden rounded-lg border border-border">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Send this
          </p>
          <CopyButton value={startPrompt} label="Copy" />
        </div>
        <p className="px-4 py-4 font-mono text-sm leading-6 text-foreground">
          {startPrompt}
        </p>
        <div className="border-t border-border px-4 py-4">
          <Button
            asChild
            size="lg"
            className="w-full text-white hover:brightness-110"
            style={accent}
          >
            <a
              href={openUrl ?? "https://claude.ai/new"}
              target="_blank"
              rel="noreferrer"
            >
              {openUrl ? "Open your project" : "Open Claude"}
              <ExternalLink aria-hidden="true" />
            </a>
          </Button>
          {openUrl ? null : (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Save your project link in step 2 and this will open it directly.
            </p>
          )}
        </div>
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
                : "Nothing saved yet."
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
  programRunModuleId,
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
  const [error, setError] = useState<string | null>(null);

  const documentSaved = artifactVersion !== null;
  const checksPassed = awaitingConfirmation || isCompleted;
  const expected =
    expectedArtifacts[0] ??
    (artifactName
      ? {
          artifactKey: "primary",
          name: artifactName,
          requiredFilename: null,
          outline: [],
        }
      : null);

  function handleConfirm() {
    if (!programRunModuleId) return;
    setError(null);
    startTransition(async () => {
      const result = await confirmModuleCompletionAction(programRunModuleId);
      if (!result.ok) {
        setError(
          result.message ??
            "That didn't work — give it another try in a moment.",
        );
        return;
      }
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
              : "Nothing to confirm yet"
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
              . Not happy with it? Ask Claude to revise — nothing is locked in
              until you confirm.
            </>
          ) : (
            "Once Claude has saved your Setup Summary and it has passed its checks, this is where you sign it off. Nothing unlocks until you do."
          )
        }
      />

      <div className="mt-8">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Expected output
        </p>
        {expected ? (
          <div className="mt-3 rounded-md border border-border bg-muted/40 px-4 py-4">
            <p className="text-sm font-medium text-foreground">
              {expected.name}
            </p>
            {expected.requiredFilename ? (
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {expected.requiredFilename}
              </p>
            ) : null}
            {expected.outline.length > 0 ? (
              <ol className="mt-3 space-y-1.5 border-t border-border/70 pt-3 text-sm text-muted-foreground">
                {expected.outline.map((section, index) => (
                  <li key={section.heading} className="flex gap-2">
                    <span className="w-4 shrink-0 font-mono text-xs tabular-nums text-muted-foreground/70">
                      {index + 1}.
                    </span>
                    <span className="text-foreground">{section.heading}</span>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            This module doesn&apos;t require a submitted file.
          </p>
        )}
      </div>

      <div className="mt-8">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Where you&apos;re up to
        </p>
        <dl className="mt-3 text-sm">
          <CheckLine
            ok={documentSaved}
            label={expected?.name ?? "Document"}
            detail={
              documentSaved
                ? `Saved · v${artifactVersion}${
                    artifactSavedAt
                      ? ` · ${formatSavedAt(artifactSavedAt)}`
                      : ""
                  }`
                : "Not saved yet"
            }
          />
          <CheckLine
            ok={checksPassed}
            label="Passed its checks"
            detail={
              checksPassed
                ? "Ready for you to look over"
                : documentSaved
                  ? "Still running"
                  : "Runs once the file is saved"
            }
          />
          <CheckLine
            ok={isCompleted}
            label={
              nextModuleTitle
                ? `Unlock ${nextModuleTitle}`
                : "Unlock the next module"
            }
            detail={
              isCompleted
                ? "Open"
                : awaitingConfirmation
                  ? "Waiting on your confirm"
                  : "Locked until you confirm"
            }
          />
        </dl>
      </div>

      <div className="mt-8">
        {isCompleted ? (
          <Button
            asChild
            size="lg"
            className="w-full text-white hover:brightness-110"
            style={accent}
          >
            <Link href="/modules">See your modules</Link>
          </Button>
        ) : awaitingConfirmation ? (
          <>
            <Button
              type="button"
              size="lg"
              className="w-full text-white hover:brightness-110"
              style={accent}
              onClick={handleConfirm}
              disabled={isPending || !programRunModuleId}
            >
              {isPending
                ? "Confirming…"
                : nextModuleTitle
                  ? `Confirm and open ${nextModuleTitle}`
                  : "Confirm and continue"}
            </Button>
            {error ? (
              <p
                role="alert"
                className="mt-2 text-center text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            Finish the check in the previous step first.
          </p>
        )}
      </div>
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
