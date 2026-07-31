"use client";

import Link from "next/link";

import { ClaudeHandoff } from "../../../../components/claude-handoff";
import { claudeHandoffCopy } from "../../../../lib/copy";
import type { Module0SetupProps, ModuleAccent } from "../../types";
import { CheckLine } from "../shared/check-line";
import { StepHeading } from "../shared/step-heading";

export function Module0CheckStep({
  connected,
  startPrompt,
  artifactName,
  artifactVersion,
  awaitingConfirmation,
  isCompleted,
  needsRetry,
  accent,
}: Module0SetupProps & { accent: ModuleAccent }) {
  const documentSaved = artifactVersion !== null;

  return (
    <>
      <StepHeading
        title="Hand it over to Claude"
        body="Send the line below. Claude confirms it can reach your workspace, then writes and saves your Setup Summary."
      />

      {!connected ? (
        <div className="mt-6 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm leading-6 text-muted-foreground">
          Claude isn&apos;t connected to this workspace yet, so nothing can be
          saved.{" "}
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
            label="Nothing missing from it"
            detail={
              awaitingConfirmation || isCompleted
                ? "Read it over whenever you're ready."
                : "Happens by itself once the document is saved."
            }
          />
        </dl>
      </div>
    </>
  );
}
