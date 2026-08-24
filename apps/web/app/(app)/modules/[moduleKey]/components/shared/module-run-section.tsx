import type { ReactNode } from "react";

import type { ArtifactValidation } from "@ai-catalyst/shared";

import { RetryPassCard } from "../retry-pass-card";
import { ValidationIssuesCard } from "../validation-issues-card";

// Shared wrapper for the module-run section — the failed-validations list
// and the retry-pass card lead every module's run experience the same way
// regardless of which wizard (Module0Setup, Module1Run, …) fills the rest.
export function ModuleRunSection({
  failedValidations,
  needsRetry,
  programRunModuleId,
  moduleIndex,
  children,
}: {
  failedValidations: ArtifactValidation[];
  needsRetry: boolean;
  programRunModuleId: string;
  moduleIndex: number;
  children: ReactNode;
}) {
  return (
    <section className="mt-8 space-y-6">
      {failedValidations.map((validation) => (
        <ValidationIssuesCard key={validation.id} validation={validation} />
      ))}
      {needsRetry ? (
        <RetryPassCard
          programRunModuleId={programRunModuleId}
          moduleIndex={moduleIndex}
        />
      ) : null}
      {children}
    </section>
  );
}
