"use client";

import { useState } from "react";

import { SHOW_CLAUDE_PROJECT } from "@/lib/feature-flags";

import { useSoftModuleRefresh } from "../../../../hooks/use-soft-module-refresh";
import { module1Copy } from "../../../../lib/copy";
import { moduleAccentStyle } from "../../../../lib/module-display";
import type { Module1RunProps } from "../../types";
import { ModuleStepWizard } from "../shared/module-step-wizard";
import { OptionalClaudeProjectCard } from "../optional-claude-project-card";
import { Module1BriefStep } from "./module1-brief-step";
import { Module1ConfirmStep } from "./module1-confirm-step";
import { Module1WorkStep } from "./module1-work-step";

/**
 * Module 1 in the same three-card shape as Module 0's setup: say what the
 * module is for and what it costs, hand over the prompt, then show honest
 * progress and take the sign-off. One card at a time keeps "what do I do
 * now" unambiguous.
 */
export function Module1Run(props: Module1RunProps) {
  const {
    moduleIndex,
    coreQuestions,
    hasAttempt,
    awaitingConfirmation,
    isCompleted,
    preview,
    connected,
    needsRetry,
    ventureId,
    claudeProjectId,
  } = props;
  const isPreview = preview !== null;

  const answered = coreQuestions.filter(
    (q) => q.responseStatus !== null,
  ).length;
  const started =
    hasAttempt || answered > 0 || awaitingConfirmation || isCompleted;

  const shouldPoll =
    connected &&
    !isPreview &&
    !awaitingConfirmation &&
    !isCompleted &&
    !needsRetry;

  useSoftModuleRefresh(shouldPoll);

  const steps = [
    { label: module1Copy.stepBrief, done: started },
    {
      label: module1Copy.stepWork,
      done: awaitingConfirmation || isCompleted,
    },
    { label: module1Copy.stepConfirm, done: isCompleted },
  ];

  const firstIncomplete = steps.findIndex((step) => !step.done);
  const [active, setActive] = useState(
    firstIncomplete === -1 ? steps.length - 1 : firstIncomplete,
  );

  const accent = moduleAccentStyle(moduleIndex);

  return (
    <div className="space-y-6">
      <ModuleStepWizard
        steps={steps}
        active={active}
        onActiveChange={setActive}
        accent={accent}
      >
        {active === 0 ? <Module1BriefStep {...props} /> : null}
        {active === 1 ? <Module1WorkStep {...props} accent={accent} /> : null}
        {active === 2 ? (
          <Module1ConfirmStep {...props} accent={accent} />
        ) : null}
      </ModuleStepWizard>
      {SHOW_CLAUDE_PROJECT && isCompleted && ventureId ? (
        <OptionalClaudeProjectCard
          ventureId={ventureId}
          initialProjectId={claudeProjectId}
        />
      ) : null}
    </div>
  );
}
