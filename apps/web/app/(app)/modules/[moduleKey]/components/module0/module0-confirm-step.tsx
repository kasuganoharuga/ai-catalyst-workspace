"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

import { module1Copy } from "../../../../lib/copy";
import { formatSavedAt } from "../../lib/format-saved-at";
import { useConfirmModuleCompletion } from "../../hooks/use-confirm-module-completion";
import type { Module0SetupProps, ModuleAccent } from "../../types";
import { CheckLine } from "../shared/check-line";
import { StepHeading } from "../shared/step-heading";

export function Module0ConfirmStep({
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
}: Module0SetupProps & { accent: ModuleAccent }) {
  const { isPending, handleConfirm } = useConfirmModuleCompletion({
    moduleKey,
    programRunModuleId,
    nextModuleTitle,
  });

  const documentSaved = artifactVersion !== null;
  const checksPassed = awaitingConfirmation || isCompleted;
  const expected = expectedArtifacts[0] ?? null;

  return (
    <>
      <StepHeading
        title={
          isCompleted
            ? "Done — and the program is open"
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
              Read what was saved, make sure it matches what this module asked
              for, then confirm. That marks Module 0 done
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
            "We haven't found a Setup Summary in your workspace yet. Once it's saved and passes its checks, this is where you sign it off. Nothing unlocks until you do."
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
            label="Nothing missing from it"
            detail={
              checksPassed
                ? "Read it over whenever you're ready."
                : documentSaved
                  ? "Checking now."
                  : "Happens by itself once the file is saved."
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
              href={`/artefacts/${encodeURIComponent(moduleKey)}/${encodeURIComponent(artifactKey)}`}
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              Read document
            </Link>
            <a
              href={`/artefacts/${encodeURIComponent(moduleKey)}/${encodeURIComponent(artifactKey)}/download`}
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
          Finish the check in your AI assistant first — this page updates when
          the file lands.
        </p>
      )}
    </>
  );
}
