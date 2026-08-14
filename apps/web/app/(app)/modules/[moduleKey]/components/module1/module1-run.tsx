"use client";

import { useState } from "react";

import { SHOW_CLAUDE_PROJECT } from "@/lib/feature-flags";

import { useSoftModuleRefresh } from "../../../../hooks/use-soft-module-refresh";
import { resolveModuleCopy } from "../../../../lib/copy";
import {
  MODULE_1_KEY,
  MODULE_2_KEY,
  MODULE_3_KEY,
  moduleAccentStyle,
} from "../../../../lib/module-display";
import type { Module1RunProps } from "../../types";
import { ModuleStepWizard } from "../shared/module-step-wizard";
import { OptionalClaudeProjectCard } from "../optional-claude-project-card";
import { Module1BriefStep } from "./module1-brief-step";
import { Module1ConfirmStep } from "./module1-confirm-step";
import { Module1DocumentsStep } from "./module1-documents-step";
import { Module1WorkStep } from "./module1-work-step";

/**
 * The card wizard every standard Module (1 today, 2-7 as of this change)
 * shares with Module 0's setup: say what the module is for and what it
 * costs, collect any documents up front, hand over the prompt, then show
 * honest progress and take the sign-off. One card at a time keeps "what do
 * I do now" unambiguous. Documents sits before Work deliberately — the
 * assistant reads whatever is uploaded at the start of the conversation, so
 * it has to already be there by the time Work hands off to it.
 * The name is a holdover from when Module 1 was the only standard Module;
 * `moduleKey` picks which Module's own copy actually renders.
 *
 * Modules 1, 2 and 3 are the exception: any prep material the Founder has
 * goes straight into the chat with the assistant, which reads it and
 * calls save_prep_extract itself — so all three skip the Documents card
 * entirely (three cards, not four) rather than routing through a website
 * upload the assistant then has to fetch back out again.
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
  const showDocumentsStep =
    moduleKey !== MODULE_1_KEY &&
    moduleKey !== MODULE_2_KEY &&
    moduleKey !== MODULE_3_KEY;

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

  const cards = [
    {
      label: copy.stepBrief,
      done: started,
      render: () => <Module1BriefStep {...props} />,
    },
    // Optional, so "done" tracks the same "has the founder moved past
    // this point" signal as Brief rather than whether a file was
    // actually added — otherwise a founder who chooses not to upload
    // anything would get bounced back here on every visit once they had
    // already started working in Work or Confirm.
    ...(showDocumentsStep
      ? [
          {
            label: copy.stepDocuments,
            done: started,
            render: () => <Module1DocumentsStep {...props} />,
          },
        ]
      : []),
    {
      label: copy.stepWork,
      done: awaitingConfirmation || isCompleted,
      render: () => <Module1WorkStep {...props} accent={accent} />,
    },
    {
      label: copy.stepConfirm,
      done: isCompleted,
      render: () => <Module1ConfirmStep {...props} accent={accent} />,
    },
  ];

  const steps = cards.map(({ label, done }) => ({ label, done }));
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
        {cards[active]?.render() ?? null}
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
