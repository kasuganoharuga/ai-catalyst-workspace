"use client";

import { useState } from "react";

import { useSoftModuleRefresh } from "../../../../hooks/use-soft-module-refresh";
import { moduleAccentStyle } from "../../../../lib/module-display";
import type { Module0SetupProps } from "../../types";
import { ModuleStepWizard } from "../shared/module-step-wizard";
import { Module0CheckStep } from "./module0-check-step";
import { Module0ConfirmStep } from "./module0-confirm-step";

/**
 * Module 0 — assistant first: hand over the message, then Confirm on the
 * website. Project linking is optional elsewhere; not part of this path.
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
      label: "Hand it over",
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
    <ModuleStepWizard
      steps={steps}
      active={active}
      onActiveChange={setActive}
      accent={accent}
    >
      {active === 0 ? <Module0CheckStep {...props} accent={accent} /> : null}
      {active === 1 ? <Module0ConfirmStep {...props} accent={accent} /> : null}
    </ModuleStepWizard>
  );
}
