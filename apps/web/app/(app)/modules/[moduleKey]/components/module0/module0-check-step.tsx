"use client";

import Link from "next/link";

import { AssistantHandoff } from "../../../../components/assistant-handoff";
import { resolveAssistant } from "../../../../lib/assistant";
import { module0Copy } from "../../../../lib/copy";
import type { Module0SetupProps, ModuleAccent } from "../../types";
import { CheckLine } from "../shared/check-line";
import { StepHeading } from "../shared/step-heading";

export function Module0CheckStep({
  connected,
  provider,
  startPrompt,
  artifactName,
  artifactVersion,
  awaitingConfirmation,
  isCompleted,
  needsRetry,
  accent,
}: Module0SetupProps & { accent: ModuleAccent }) {
  const documentSaved = artifactVersion !== null;
  const assistant = resolveAssistant(provider);

  return (
    <>
      <StepHeading
        title={module0Copy.checkTitle(assistant.name)}
        body={module0Copy.checkBody(assistant.name)}
      />

      {!connected ? (
        <div className="mt-6 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm leading-6 text-muted-foreground">
          {module0Copy.notConnected}{" "}
          <Link
            href="/connection"
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            {module0Copy.notConnectedLink}
          </Link>
          {module0Copy.notConnectedSuffix}
        </div>
      ) : null}

      <div className="mt-6">
        <AssistantHandoff
          provider={provider}
          prompt={startPrompt}
          retry={needsRetry}
          accent={accent}
        />
      </div>

      <div className="mt-8">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {module0Copy.progressHeading}
        </p>
        <dl className="mt-3 text-sm">
          <CheckLine
            ok={documentSaved}
            label={module0Copy.progressSaved}
            detail={
              documentSaved
                ? `${artifactName ?? "Document"} · version ${artifactVersion}`
                : module0Copy.progressSavedPending
            }
          />
          <CheckLine
            ok={awaitingConfirmation || isCompleted}
            label={module0Copy.progressChecks}
            detail={
              awaitingConfirmation || isCompleted
                ? module0Copy.progressChecksDone
                : module0Copy.progressChecksPending
            }
          />
        </dl>
      </div>
    </>
  );
}
