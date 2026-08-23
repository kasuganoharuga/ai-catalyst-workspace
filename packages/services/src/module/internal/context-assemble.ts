import { loggerForService } from "@ai-catalyst/observability/logger";
import { SERVICE_NAMES } from "@ai-catalyst/observability/service-names";
import type {
  ArtifactSubmissionStatus,
  ModuleAttempt,
  ModuleAttemptStatus,
  ModuleContext,
  ModuleContextArtifactSummary,
  ModuleContextPrepDocument,
  ModuleContextPrompt,
  ModuleContextQuestion,
  ModuleInterviewGateStatus,
  RunModuleSummary,
} from "@ai-catalyst/shared";

import { ServiceError } from "@ai-catalyst/services/errors";
import { MINIMUM_CONFIRMED_INTERVIEWS } from "@ai-catalyst/services/prep/types";
import {
  mapAttemptRow,
  type AttemptRow,
} from "@ai-catalyst/services/attempt/internal/rows";
import type {
  ArtifactRow,
  QuestionRow,
  ResponseLookupRow,
} from "@ai-catalyst/services/module/internal/context-rows";

// Pure display/resume/gate logic — deliberately zero `pg`/@ai-catalyst/db
// import, so this is directly unit-testable offline (see
// context-assemble.test.ts) instead of only reachable through the db
// integration suite.

const log = loggerForService(SERVICE_NAMES.services);

// Mirrors apps/web/app/(app)/lib/module-display.ts's MODULE_4_KEY — this
// layer does not depend on the web app, so the content-stable key is
// repeated here rather than imported, matching how content-seed also
// keeps its own copy of the same literal.
const MODULE_4_KEY = "module-04-solution-statement";

export function mapArtifactSummaries(
  rows: ArtifactRow[],
): ModuleContextArtifactSummary[] {
  return rows.map((row) => {
    const workbookSupported = row.renderer_key !== null;
    return {
      artifactKey: row.artifact_key,
      name: row.name,
      isRequired: row.is_required,
      requiredFilename: row.required_filename,
      templateMarkdown: row.template_markdown,
      latestSubmission:
        row.submission_version_number === null ||
        row.submission_updated_at === null
          ? null
          : {
              versionNumber: row.submission_version_number,
              status: row.submission_status as ArtifactSubmissionStatus,
              submittedAt: row.submission_submitted_at?.toISOString() ?? null,
              updatedAt: row.submission_updated_at.toISOString(),
            },
      workbookSupported,
      // "Confirmed" per the operational-workbooks plan: submitted, never a
      // draft or an unvalidated save. The lateral join above already
      // excludes superseded/deleted, so 'submitted' is the only non-draft
      // status that can reach here.
      workbookAvailable:
        workbookSupported && row.submission_status === "submitted",
      workbookFormat: workbookSupported ? "pdf" : null,
    };
  });
}

export function attemptHasAnsweredResponses(
  attemptId: string,
  responsesByAttemptId: Map<string, Map<string, ResponseLookupRow>>,
): boolean {
  const responses = responsesByAttemptId.get(attemptId);
  if (!responses) {
    return false;
  }
  for (const response of responses.values()) {
    if (
      response.response_status === "answered" ||
      response.response_status === "skipped"
    ) {
      return true;
    }
  }
  return false;
}

/**
 * True when the Attempt has answered/skipped at least one of the Module's
 * current Question keys. Prefer this over {@link attemptHasAnsweredResponses}
 * for checklist hydration: a Retry that kept stale keys from an earlier
 * schema must not "own" the checklist while every live key is blank.
 */
export function attemptHasCurrentQuestionResponses(
  attemptId: string,
  questionKeys: readonly string[],
  responsesByAttemptId: Map<string, Map<string, ResponseLookupRow>>,
): boolean {
  if (questionKeys.length === 0) {
    return attemptHasAnsweredResponses(attemptId, responsesByAttemptId);
  }
  const responses = responsesByAttemptId.get(attemptId);
  if (!responses) {
    return false;
  }
  for (const key of questionKeys) {
    const response = responses.get(key);
    if (
      response &&
      (response.response_status === "answered" ||
        response.response_status === "skipped")
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Walk active → based_on → … and return the nearest Attempt that still has
 * usable Responses for the current Question keys. Empty Retries that reach
 * ready_for_review by re-saving Artifacts keep the prior checklist visible
 * even when the based_on chain is deeper than one hop.
 */
export function resolveReadResponseAttemptId(
  startAttemptId: string | null,
  questionKeys: readonly string[],
  attemptsById: Map<string, AttemptRow>,
  responsesByAttemptId: Map<string, Map<string, ResponseLookupRow>>,
): string | null {
  let cursor = startAttemptId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    if (
      attemptHasCurrentQuestionResponses(
        cursor,
        questionKeys,
        responsesByAttemptId,
      )
    ) {
      return cursor;
    }
    cursor = attemptsById.get(cursor)?.based_on_attempt_id ?? null;
  }
  return startAttemptId;
}

/** Attempts that have finished (or nearly finished) owning their own outputs. */
export function isAttemptArtifactOwner(status: ModuleAttemptStatus): boolean {
  return (
    status === "submitted" ||
    status === "ready_for_review" ||
    status === "accepted"
  );
}

export function assembleModuleContext(
  runModule: RunModuleSummary,
  fallbackDisplayAttemptId: string | null,
  attemptsById: Map<string, AttemptRow>,
  questionsByModuleDefinitionId: Map<string, QuestionRow[]>,
  responsesByAttemptId: Map<string, Map<string, ResponseLookupRow>>,
  artifactsByModuleDefinitionId: Map<string, ArtifactRow[]>,
  promptsByModuleDefinitionId: Map<string, ModuleContextPrompt[]>,
  prepDocumentsByRunModuleId: Map<string, ModuleContextPrepDocument[]>,
): ModuleContext {
  let activeAttempt: ModuleAttempt | null = null;
  if (runModule.activeAttemptId) {
    const attemptRow = attemptsById.get(runModule.activeAttemptId);
    if (!attemptRow) {
      throw new ServiceError(
        "INTERNAL_INVARIANT_ERROR",
        `program_run_module ${runModule.id}'s active_attempt_id points to a non-existent Attempt.`,
      );
    }
    activeAttempt = mapAttemptRow(attemptRow);
  }

  // Read surface: show prior answers when the active Attempt is a fresh
  // empty Retry (based_on still holds them), or when active is cleared
  // after validation_failed. Never do this once the active Attempt has
  // reached submitted / ready_for_review / accepted — those own their own
  // Responses and Artifacts (a Retry can save outputs without re-answering
  // every Question; falling back would hide the successful work).
  // Write surface stays on activeAttempt.
  let displayAttempt: ModuleAttempt | null = activeAttempt;
  if (
    activeAttempt &&
    !isAttemptArtifactOwner(activeAttempt.status) &&
    !attemptHasAnsweredResponses(activeAttempt.id, responsesByAttemptId) &&
    activeAttempt.basedOnAttemptId
  ) {
    const priorRow = attemptsById.get(activeAttempt.basedOnAttemptId);
    if (priorRow) {
      displayAttempt = mapAttemptRow(priorRow);
    }
  } else if (!displayAttempt && fallbackDisplayAttemptId) {
    const displayRow = attemptsById.get(fallbackDisplayAttemptId);
    if (displayRow) {
      displayAttempt = mapAttemptRow(displayRow);
    }
  }

  const questionRows =
    questionsByModuleDefinitionId.get(runModule.moduleDefinitionId) ?? [];
  const questionKeys = questionRows.map((row) => row.question_key);
  // Question checklist: walk the based_on chain for the nearest Attempt
  // that still has Responses for the current Question keys. A Retry that
  // reaches ready_for_review by re-saving Artifacts without re-answering
  // must keep the prior checklist visible (displayAttempt stays the
  // artifact owner for status / Saved versions).
  const readResponseAttemptId = resolveReadResponseAttemptId(
    activeAttempt?.id ?? displayAttempt?.id ?? null,
    questionKeys,
    attemptsById,
    responsesByAttemptId,
  );
  const readResponseMap = readResponseAttemptId
    ? (responsesByAttemptId.get(readResponseAttemptId) ?? new Map())
    : new Map<string, ResponseLookupRow>();
  // Write surface is activeAttempt only — never fall back to displayAttempt
  // (often terminal after validation_failed; Retries start empty).
  const writeResponseMap = activeAttempt
    ? (responsesByAttemptId.get(activeAttempt.id) ??
      new Map<string, ResponseLookupRow>())
    : new Map<string, ResponseLookupRow>();

  const questions: ModuleContextQuestion[] = questionRows.map((row) => {
    const response = readResponseMap.get(row.question_key);
    return {
      questionKey: row.question_key,
      sequenceIndex: row.sequence_index,
      questionText: row.question_text,
      responseType: row.response_type,
      allowSkip: row.allow_skip,
      options: row.options,
      responseStatus: response?.response_status ?? null,
      answerText: response?.answer_text ?? null,
    };
  });
  // First unanswered key on the write surface (caller must start_module_attempt first).
  const resumeQuestionKey =
    questionRows.find((row) => !writeResponseMap.has(row.question_key))
      ?.question_key ?? null;

  const artifactRows =
    artifactsByModuleDefinitionId.get(runModule.moduleDefinitionId) ?? [];
  const artifacts = mapArtifactSummaries(artifactRows);
  const answered = questions.filter(
    (question) =>
      question.responseStatus === "answered" ||
      question.responseStatus === "skipped",
  ).length;
  const total = questions.length;

  // Diagnostic only — never write module_events on the hydration path.
  // Surfaces the historical "4/4 → 0/4 with Saved artefacts" class of bugs.
  if (
    activeAttempt &&
    isAttemptArtifactOwner(activeAttempt.status) &&
    artifacts.length > 0 &&
    total > 0 &&
    answered === 0
  ) {
    log.warn({
      event: "module_checklist_state_mismatch",
      message: "Module checklist state does not match artifact owner attempt",
      module_key: runModule.moduleKey,
      attempt_id: activeAttempt.id,
      read_attempt_id: readResponseAttemptId,
      active_attempt_id: activeAttempt.id,
      answered,
      total,
      artifact_count: artifacts.length,
      attempt_status: activeAttempt.status,
    });
  }

  const prepDocuments = prepDocumentsByRunModuleId.get(runModule.id) ?? [];
  const interviewGate: ModuleInterviewGateStatus | null =
    runModule.moduleKey === MODULE_4_KEY
      ? buildInterviewGateStatus(prepDocuments)
      : null;

  return {
    runModule,
    activeAttempt,
    displayAttempt,
    resumeQuestionKey,
    questions,
    artifacts,
    prompts:
      promptsByModuleDefinitionId.get(runModule.moduleDefinitionId) ?? [],
    prepDocuments,
    interviewGate,
  };
}

/**
 * Confirmed-interview count against Module 4's floor, computed from the
 * same prepDocuments already loaded for this context — see
 * countConfirmedInterviews in packages/services/src/prep/index.ts for the
 * equivalent standalone query used by saveFounderResponse's gate check.
 */
export function buildInterviewGateStatus(
  prepDocuments: ModuleContextPrepDocument[],
): ModuleInterviewGateStatus {
  const confirmedInterviewCount = prepDocuments
    .filter((document) => document.documentKind === "interview_transcript")
    .reduce((total, document) => total + (document.interviewCount ?? 0), 0);
  return {
    confirmedInterviewCount,
    minimumRequired: MINIMUM_CONFIRMED_INTERVIEWS,
    gateMet: confirmedInterviewCount >= MINIMUM_CONFIRMED_INTERVIEWS,
  };
}
