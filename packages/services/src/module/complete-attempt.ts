import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { ModuleAttempt } from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { resolveFounderWorkspace } from "@ai-catalyst/services/workspace";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import { submitAttempt } from "@ai-catalyst/services/attempt";
import { mapAttemptRow } from "@ai-catalyst/services/attempt/internal/rows";
import {
  runOfficialValidation,
  type ArtifactServiceDependencies,
} from "@ai-catalyst/services/artifact";
import {
  loadAttemptRow,
  loadCompletionContext,
} from "@ai-catalyst/services/module/internal/completion-rows";
import {
  ensureSetupSummarySubmission,
  type NextModuleUnlocked,
} from "@ai-catalyst/services/module/internal/complete-system-module";

// Orchestrates module completion after complete_module: submitAttempt,
// runOfficialValidation, then leave the Attempt at ready_for_review for
// website confirmModuleCompletion — AI is advisor, not gatekeeper.

function normalizeCompleteModuleAttemptInput(input: unknown): {
  attemptId: string;
} {
  if (typeof input !== "object" || input === null || !("attemptId" in input)) {
    throw new ServiceError("VALIDATION_ERROR", "attemptId is required.");
  }
  const { attemptId } = input as { attemptId: unknown };
  if (typeof attemptId !== "string" || attemptId.trim().length === 0) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "attemptId must be a non-blank string.",
    );
  }
  return { attemptId };
}

export interface ModuleValidationError {
  key: string;
  message: string;
}

export interface CompleteModuleAttemptResult {
  attempt: ModuleAttempt;
  passed: boolean;
  // Mirrors RunOfficialValidationResult's own field — required Artifacts
  // with no submission at all. Always [] once passed is true.
  missingArtifactKeys: string[];
  // Failed official-validation checks (and missing-artifact keys) so the
  // AI client can repair named gaps. Always [] once passed is true.
  validationErrors: ModuleValidationError[];
  // True only when the Module is already at
  // program_run_modules.status = 'completed' — which, since Founder
  // confirmation became a required step, only happens on the idempotent
  // replay of an already-confirmed Attempt. A first successful pass
  // through this function now leaves the Module awaiting confirmation
  // instead.
  moduleCompleted: boolean;
  // Set only when this call itself completed the Module, which is now
  // exclusively confirmModuleCompletion's job. Kept on this result so an
  // idempotent replay can still report what happened.
  nextModuleUnlocked: NextModuleUnlocked | null;
  // True once validation has passed and the Attempt is sitting at
  // 'ready_for_review', waiting for the Founder to confirm the output on
  // the website. This is the normal terminal state of a successful
  // `complete_module` call from MCP.
  awaitingConfirmation: boolean;
}

function collectValidationErrors(
  missingArtifactKeys: string[],
  validations: Awaited<ReturnType<typeof runOfficialValidation>>["validations"],
): ModuleValidationError[] {
  const errors: ModuleValidationError[] = missingArtifactKeys.map((key) => ({
    key: `missing_artifact:${key}`,
    message: `Required artifact "${key}" was never saved.`,
  }));
  for (const validation of validations) {
    for (const check of validation.checks) {
      if (!check.passed) {
        errors.push({
          key: check.key,
          message: check.message ?? `Check "${check.key}" failed.`,
        });
      }
    }
    for (const issue of validation.issues) {
      if (!errors.some((error) => error.message === issue)) {
        errors.push({ key: "validation_issue", message: issue });
      }
    }
  }
  return errors;
}

/**
 * MCP complete_module: submit + validate, stop at ready_for_review for website confirm.
 */
export async function completeModuleAttempt(
  actor: ActorContext,
  input: unknown,
  // Test-only DI seam, forwarded to runOfficialValidation only (same
  // pattern as ArtifactServiceDependencies' own callers) — lets
  // completion.db.test.ts register a fixture Validator without touching
  // the real content's registrations in
  // artifact/internal/validators/registry.ts.
  deps: ArtifactServiceDependencies = {},
): Promise<CompleteModuleAttemptResult> {
  assertRole(actor, ["founder"]);
  const normalized = normalizeCompleteModuleAttemptInput(input);
  const attemptId = parseEntityIdOrNotFound(
    normalized.attemptId,
    "Attempt not found.",
  );
  const workspace = await resolveFounderWorkspace(actor);

  const initialAttempt = await loadAttemptRow(attemptId, workspace.id);
  if (!initialAttempt) {
    throw new ServiceError("NOT_FOUND", "Attempt not found.");
  }

  if (initialAttempt.status === "accepted") {
    return {
      attempt: mapAttemptRow(initialAttempt),
      passed: true,
      missingArtifactKeys: [],
      validationErrors: [],
      moduleCompleted: true,
      nextModuleUnlocked: null,
      awaitingConfirmation: false,
    };
  }

  const context = await loadCompletionContext(
    initialAttempt.program_run_module_id,
    workspace.id,
  );
  if (!context) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `Attempt ${attemptId} has no owning program_run_module.`,
    );
  }

  if (context.module_type === "setup") {
    await ensureSetupSummarySubmission(
      actor,
      attemptId,
      context.module_definition_id,
      context,
    );
  }

  await submitAttempt(actor, { attemptId });

  // Only runOfficialValidation itself needs `source: 'system'` (its own
  // assertOfficialValidationAuthority requires it). Accepting and
  // unlocking remain confirmModuleCompletion's job on the website.
  const systemActor: ActorContext = { ...actor, source: "system" };
  const validation = await runOfficialValidation(
    systemActor,
    { attemptId },
    deps,
  );

  if (!validation.passed) {
    const attemptRow = await loadAttemptRow(attemptId, workspace.id);
    if (!attemptRow) {
      throw new ServiceError(
        "INTERNAL_INVARIANT_ERROR",
        `Attempt ${attemptId} disappeared mid-flight.`,
      );
    }
    return {
      attempt: mapAttemptRow(attemptRow),
      passed: false,
      missingArtifactKeys: validation.missingArtifactKeys,
      validationErrors: collectValidationErrors(
        validation.missingArtifactKeys,
        validation.validations,
      ),
      moduleCompleted: false,
      nextModuleUnlocked: null,
      awaitingConfirmation: false,
    };
  }

  // Deliberately stops here rather than completing the Module.
  // Unlocking is an explicit Founder action on the website
  // (confirmModuleCompletion); this call leaves the Attempt at
  // 'ready_for_review' for them to confirm — for both system and
  // non-system completion modes, and for any Founder decision.
  const attemptRow = await loadAttemptRow(attemptId, workspace.id);
  if (!attemptRow) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `Attempt ${attemptId} disappeared mid-flight.`,
    );
  }
  return {
    attempt: mapAttemptRow(attemptRow),
    passed: true,
    missingArtifactKeys: [],
    validationErrors: [],
    moduleCompleted: false,
    nextModuleUnlocked: null,
    awaitingConfirmation: true,
  };
}
