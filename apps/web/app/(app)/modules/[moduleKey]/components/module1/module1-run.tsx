"use client";

import { useState } from "react";

import { SHOW_CLAUDE_PROJECT } from "@/lib/feature-flags";

import { useSoftModuleRefresh } from "../../../../hooks/use-soft-module-refresh";
import { resolveModuleCopy } from "../../../../lib/copy";
import { moduleAccentStyle } from "../../../../lib/module-display";
import type { Module1RunProps } from "../../types";
import { ModuleStepWizard } from "../shared/module-step-wizard";
import { OptionalClaudeProjectCard } from "../optional-claude-project-card";
import { Module1BriefStep } from "./module1-brief-step";
import { Module1ConfirmStep } from "./module1-confirm-step";
import { Module1WorkStep } from "./module1-work-step";

/**
 * The three-card wizard every standard Module (1 today, 2-4 as of this
 * change) shares with Module 0's setup: say what the module is for and
 * what it costs, hand over the prompt, then show honest progress and take
 * the sign-off. One card at a time keeps "what do I do now" unambiguous.
 * The name is a holdover from when Module 1 was the only standard Module;
 * `moduleKey` picks which Module's own copy actually renders.
 */
export function Module1Run(props: Module1RunProps) {
  const {
    moduleKey,
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
  const copy = resolveModuleCopy(moduleKey);

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
    { label: copy.stepBrief, done: started },
    {
      label: copy.stepWork,
      done: awaitingConfirmation || isCompleted,
    },
    { label: copy.stepConfirm, done: isCompleted },
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
