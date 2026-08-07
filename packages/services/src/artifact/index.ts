import type { Pool, PoolClient } from "pg";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type {
  ArtifactSubmission,
  ArtifactSubmissionCreatedVia,
  ArtifactSubmissionStatus,
  ArtifactValidation,
  ArtifactValidationCheck,
  ArtifactValidationKind,
  ArtifactValidationStatus,
  ArtifactValidationTriggeredVia,
  ModuleAttemptStatus,
  ModuleResponseStatus,
  ModuleType,
} from "@ai-catalyst/shared";

import { ServiceError, assertRole } from "@ai-catalyst/services/errors";
import { resolveFounderWorkspace } from "@ai-catalyst/services/workspace";
import { parseEntityIdOrNotFound } from "@ai-catalyst/services/internal/entity-id";
import {
  createPendingGeneratedObject,
  getGeneratedTextContent,
  writeGeneratedTextContent,
} from "@ai-catalyst/services/storage";
import { sha256 } from "@ai-catalyst/services/storage/internal/hash";
import { resolveValidator } from "@ai-catalyst/services/artifact/internal/validators/registry";
import { resolveSubmissionCreatedVia } from "@ai-catalyst/services/artifact/internal/created-via";
import {
  resolveArtifactEventActorType,
  resolveArtifactEventSourceProvider,
  resolveValidationTriggeredVia,
} from "@ai-catalyst/services/artifact/internal/triggered-via";

import type { ValidationRunResult, Validator } from "./internal/validators/types.js";

// Owns Artifact Submission versioning and ValidationService (draft_check /
// official validation). apps/web and apps/mcp call the same Service
// functions. runOfficialValidation is not an MCP tool — it is invoked
// internally (with a system-sourced actor) from completeModuleAttempt.
//
// Lock ordering: lock program_run_modules before module_attempts when both
// are needed in one transaction.
//
// No Postgres transaction here is ever held open across Storage I/O
// (createPendingGeneratedObject / writeGeneratedTextContent /
// getGeneratedTextContent) — every public function below reads/checks
// first (no lock), performs Storage I/O with no transaction open, then
// opens one short transaction to re-verify and commit the actual
// business-state change. This mirrors storage/index.ts's own "a Postgres
// transaction is never held open across a disk/network call" rule.

export type QueryExecutor = Pool | PoolClient;

export interface ArtifactServiceDependencies {
  // Test-only DI seam (same pattern as ModuleCatalogDependencies/
  // StorageServiceDependencies) — lets artifact/index.db.test.ts register
  // a fixture Validator without touching the real content's own
  // registrations in internal/validators/registry.ts.
  validators?: Record<string, Validator>;
}

const EDITABLE_ATTEMPT_STATUSES = ["draft", "in_progress"] as const;
const ACTIVE_SUBMISSION_EXCLUDED_STATUSES = ["superseded", "deleted"] as const;

interface RunModuleRow {
  id: string;
  module_definition_id: string;
  program_run_id: string;
  program_run_branch_id: string;
  active_attempt_id: string | null;
  // Joined from module_definitions — used by runOfficialValidation's
  // setup-module bypass when no validator is configured.
  module_type: ModuleType;
}

interface AttemptRow {
  id: string;
  program_run_module_id: string;
  status: ModuleAttemptStatus;
}

interface ArtifactDefinitionRow {
  id: string;
  module_definition_id: string;
  artifact_key: string;
  validator_key: string | null;
  output_format: string;
  required_filename: string | null;
  validation_config: Record<string, unknown>;
  is_required: boolean;
  sequence_index: number;
}

interface LatestSubmissionRow {
  id: string;
  workspace_id: string;
  module_attempt_id: string;
  artifact_definition_id: string;
  version_number: number;
  status: ArtifactSubmissionStatus;
  created_via: ArtifactSubmissionCreatedVia;
  created_at: Date;
  submitted_at: Date | null;
  superseded_at: Date | null;
  // From the LEFT JOIN onto this submission's primary artifact_files row
  // and its storage_objects row — null only if the submission somehow
  // has no primary file yet, which never happens through this Service's
  // own saveArtifactSubmission (it always inserts exactly one primary
  // file in the same transaction as the submission row).
  primary_storage_object_id: string | null;
  content_sha256: string | null;
}

function mapArtifactSubmissionRow(row: LatestSubmissionRow): ArtifactSubmission {
  return {
    id: row.id,
    moduleAttemptId: row.module_attempt_id,
    artifactDefinitionId: row.artifact_definition_id,
    versionNumber: row.version_number,
    status: row.status,
    createdVia: row.created_via,
    createdAt: row.created_at.toISOString(),
    submittedAt: row.submitted_at?.toISOString() ?? null,
    supersededAt: row.superseded_at?.toISOString() ?? null,
  };
}

interface ArtifactValidationRow {
  id: string;
  artifact_submission_id: string;
  validation_number: number;
  validation_kind: ArtifactValidationKind;
  status: ArtifactValidationStatus;
  validator_key: string;
  validator_version: string;
  triggered_via: ArtifactValidationTriggeredVia;
  checks: unknown;
  issues: unknown;
  warnings: unknown;
  summary: string | null;
  score: string | null;
  created_at: Date;
}

function mapArtifactValidationRow(row: ArtifactValidationRow): ArtifactValidation {
  return {
    id: row.id,
    artifactSubmissionId: row.artifact_submission_id,
    validationNumber: row.validation_number,
    validationKind: row.validation_kind,
    status: row.status,
    validatorKey: row.validator_key,
    validatorVersion: row.validator_version,
    triggeredVia: row.triggered_via,
    checks: Array.isArray(row.checks) ? (row.checks as ArtifactValidationCheck[]) : [],
    issues: Array.isArray(row.issues) ? (row.issues as string[]) : [],
    warnings: Array.isArray(row.warnings) ? (row.warnings as string[]) : [],
    summary: row.summary,
    // numeric(5,2) comes back from `pg` as a string — parsed here at the
    // DTO boundary, same convention as storage/index.ts's sizeBytes.
    score: row.score === null ? null : Number(row.score),
    createdAt: row.created_at.toISOString(),
  };
}

// Shared by both founder-scoped callers (saveArtifactSubmission,
// runDraftCheck) and the trusted system/admin caller
// (runOfficialValidation) below, via two thin wrappers — the row-locking
// logic itself (and the mandated program_run_modules-before-
// module_attempts lock order) is identical either way; only how the
// Workspace is resolved differs.
async function resolveAttemptContext(
  workspaceId: string,
  attemptId: string,
  executor: QueryExecutor,
  options: { forUpdate: boolean },
): Promise<{ runModule: RunModuleRow; attempt: AttemptRow }> {
  const lookupResult = await executor.query<{ program_run_module_id: string }>(
    `select program_run_module_id from module_attempts where id = $1 and workspace_id = $2`,
    [attemptId, workspaceId],
  );
  const runModuleId = lookupResult.rows[0]?.program_run_module_id;
  if (!runModuleId) {
    throw new ServiceError("NOT_FOUND", "Attempt not found.");
  }

  const runModuleResult = await executor.query<RunModuleRow>(
    `select m.id, m.module_definition_id, m.program_run_id, m.program_run_branch_id,
            m.active_attempt_id, d.module_type
     from program_run_modules m
     join module_definitions d on d.id = m.module_definition_id
     where m.id = $1 and m.workspace_id = $2
     ${options.forUpdate ? "for update of m" : ""}`,
    [runModuleId, workspaceId],
  );
  const runModule = runModuleResult.rows[0];
  if (!runModule) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `Attempt ${attemptId} has no owning program_run_module.`,
    );
  }

  const attemptResult = await executor.query<AttemptRow>(
    `select id, program_run_module_id, status from module_attempts
     where id = $1 and program_run_module_id = $2
     ${options.forUpdate ? "for update" : ""}`,
    [attemptId, runModule.id],
  );
  const attempt = attemptResult.rows[0];
  if (!attempt) {
    throw new ServiceError("NOT_FOUND", "Attempt not found.");
  }

  return { runModule, attempt };
}

async function resolveAttemptContextForFounder(
  actor: ActorContext,
  attemptId: string,
  executor: QueryExecutor,
  options: { forUpdate: boolean },
): Promise<{ workspaceId: string; runModule: RunModuleRow; attempt: AttemptRow }> {
  const workspace = await resolveFounderWorkspace(actor, executor);
  const { runModule, attempt } = await resolveAttemptContext(
    workspace.id,
    attemptId,
    executor,
    options,
  );
  return { workspaceId: workspace.id, runModule, attempt };
}

// No Workspace comparison at all — trusted for the same reason
// loadAuthorizedStorageObject's system branch and
// getGeneratedTextContent's system/admin branch have none: there is no
// "system's own Workspace" or "admin's own Workspace" to compare
// against. Only reachable after assertOfficialValidationAuthority.
async function resolveAttemptContextTrusted(
  attemptId: string,
  executor: QueryExecutor,
  options: { forUpdate: boolean },
): Promise<{ workspaceId: string; runModule: RunModuleRow; attempt: AttemptRow }> {
  const lookupResult = await executor.query<{ workspace_id: string }>(
    `select workspace_id from module_attempts where id = $1`,
    [attemptId],
  );
  const workspaceId = lookupResult.rows[0]?.workspace_id;
  if (!workspaceId) {
    throw new ServiceError("NOT_FOUND", "Attempt not found.");
  }
  const { runModule, attempt } = await resolveAttemptContext(
    workspaceId,
    attemptId,
    executor,
    options,
  );
  return { workspaceId, runModule, attempt };
}

async function loadArtifactDefinitionByKey(
  executor: QueryExecutor,
  moduleDefinitionId: string,
  artifactKey: string,
): Promise<ArtifactDefinitionRow> {
  const result = await executor.query<ArtifactDefinitionRow>(
    `select id, module_definition_id, artifact_key, validator_key, output_format,
            required_filename, validation_config, is_required, sequence_index
     from artifact_definitions
     where module_definition_id = $1 and artifact_key = $2 and status <> 'archived'`,
    [moduleDefinitionId, artifactKey],
  );
  const row = result.rows[0];
  if (!row) {
    // Indistinguishable from the caller's perspective whether artifactKey
    // belongs to a different Module, doesn't exist at all, or has been
    // archived out of the living content constants — same
    // enumeration-safety convention as attempt/index.ts's question lookup.
    throw new ServiceError("NOT_FOUND", "Artifact not found.");
  }
  return row;
}

async function loadRequiredArtifactDefinitions(
  executor: QueryExecutor,
  moduleDefinitionId: string,
): Promise<ArtifactDefinitionRow[]> {
  const result = await executor.query<ArtifactDefinitionRow>(
    `select id, module_definition_id, artifact_key, validator_key, output_format,
            required_filename, validation_config, is_required, sequence_index
     from artifact_definitions
     where module_definition_id = $1 and is_required = true and status <> 'archived'
     order by sequence_index`,
    [moduleDefinitionId],
  );
  return result.rows;
}

// The "latest non-superseded/deleted version" this Service treats as
// current everywhere (save idempotency comparison, draft_check target,
// official validation target) — `content_sha256`/`primary_storage_object_id`
// come from this version's primary artifact_files row (there is always
// exactly one — saveArtifactSubmission inserts submission + primary file
// together in the same transaction).
async function loadLatestSubmission(
  executor: QueryExecutor,
  attemptId: string,
  artifactDefinitionId: string,
  options: { forUpdate: boolean },
): Promise<LatestSubmissionRow | null> {
  const result = await executor.query<LatestSubmissionRow>(
    `select s.id, s.workspace_id, s.module_attempt_id, s.artifact_definition_id,
            s.version_number, s.status, s.created_via, s.created_at, s.submitted_at,
            s.superseded_at, f.storage_object_id as primary_storage_object_id,
            so.checksum_sha256 as content_sha256
     from artifact_submissions s
     left join artifact_files f on f.artifact_submission_id = s.id and f.is_primary = true
     left join storage_objects so on so.id = f.storage_object_id
     where s.module_attempt_id = $1 and s.artifact_definition_id = $2
       and s.status not in (${ACTIVE_SUBMISSION_EXCLUDED_STATUSES.map((_, i) => `$${i + 3}`).join(", ")})
     order by s.version_number desc
     limit 1
     ${options.forUpdate ? "for update of s" : ""}`,
    [attemptId, artifactDefinitionId, ...ACTIVE_SUBMISSION_EXCLUDED_STATUSES],
  );
  return result.rows[0] ?? null;
}

interface ValidationContextResponseRow {
  question_key: string;
  response_status: ModuleResponseStatus;
  answer_text: string | null;
  answer_data: unknown;
}

async function loadResponses(
  executor: QueryExecutor,
  attemptId: string,
): Promise<ValidationContextResponseRow[]> {
  const result = await executor.query<ValidationContextResponseRow>(
    `select question_key, response_status, answer_text, answer_data
     from module_responses where module_attempt_id = $1`,
    [attemptId],
  );
  return result.rows;
}

type ArtifactModuleEventType =
  | "artifact_uploaded"
  | "validation_started"
  | "validation_failed"
  | "validation_passed";

// Deliberately its OWN module_events writer, not a reuse of
// attempt/internal's insertModuleEvent — that helper's eventType union is
// scoped to attempt/index.ts's own 4 event types, and (per the
// established "don't share mappers/helpers across Service modules"
// convention — see storage/index.ts's resolveStorageCreatedVia comment)
// this module maps its own actor_type/source_provider independently.
async function insertArtifactModuleEvent(
  client: PoolClient,
  input: {
    workspaceId: string;
    programRunId: string;
    programRunBranchId: string;
    programRunModuleId: string;
    moduleAttemptId: string;
    eventType: ArtifactModuleEventType;
    actor: ActorContext;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `insert into module_events (
       workspace_id, program_run_id, program_run_branch_id, program_run_module_id,
       module_attempt_id, event_type, actor_type, actor_user_id, source_provider, metadata
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
    [
      input.workspaceId,
      input.programRunId,
      input.programRunBranchId,
      input.programRunModuleId,
      input.moduleAttemptId,
      input.eventType,
      resolveArtifactEventActorType(input.actor),
      input.actor.userId,
      resolveArtifactEventSourceProvider(input.actor),
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

// Shared by runDraftCheck and runOfficialValidation. Always inserts a
// terminal status (`passed`/`failed`) with both timestamps stamped "now"
// — validators are synchronous pure functions today, so there is no real
// `pending`/`running` interval. `summary` is left null for now.
async function insertArtifactValidation(
  client: PoolClient,
  input: {
    workspaceId: string;
    artifactSubmissionId: string;
    validationKind: ArtifactValidationKind;
    validatorKey: string;
    validatorVersion: string;
    triggeredVia: ArtifactValidationTriggeredVia;
    triggeredByUserId: string;
    ruleSnapshot: Record<string, unknown>;
    result: ValidationRunResult;
  },
): Promise<ArtifactValidationRow> {
  // Locks the minimal serialization unit (the submission row itself, not
  // run_module/attempt) before allocating validation_number — two
  // concurrent draft checks against the same submission would otherwise
  // both compute the same max()+1 and collide on
  // artifact_validations_number_unique.
  await client.query(`select id from artifact_submissions where id = $1 for update`, [
    input.artifactSubmissionId,
  ]);

  const numberResult = await client.query<{ next: number }>(
    `select coalesce(max(validation_number), 0) + 1 as next
     from artifact_validations where artifact_submission_id = $1`,
    [input.artifactSubmissionId],
  );
  const validationNumber = numberResult.rows[0].next;
  const status: ArtifactValidationStatus = input.result.passed ? "passed" : "failed";

  const result = await client.query<ArtifactValidationRow>(
    `insert into artifact_validations (
       workspace_id, artifact_submission_id, validation_number, validation_kind,
       status, validator_key, validator_version, triggered_via, triggered_by_user_id,
       rule_snapshot, checks, issues, warnings, score, started_at, completed_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14, now(), now())
     returning id, artifact_submission_id, validation_number, validation_kind, status,
       validator_key, validator_version, triggered_via, checks, issues, warnings, summary,
       score, created_at`,
    [
      input.workspaceId,
      input.artifactSubmissionId,
      validationNumber,
      input.validationKind,
      status,
      input.validatorKey,
      input.validatorVersion,
      input.triggeredVia,
      input.triggeredByUserId,
      JSON.stringify(input.ruleSnapshot),
      JSON.stringify(input.result.checks),
      JSON.stringify(input.result.issues),
      JSON.stringify(input.result.warnings),
      input.result.score,
    ],
  );
  return result.rows[0];
}

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function assertEditableAttempt(status: ModuleAttemptStatus): void {
  if (!(EDITABLE_ATTEMPT_STATUSES as readonly ModuleAttemptStatus[]).includes(status)) {
    throw new ServiceError(
      "ATTEMPT_NOT_EDITABLE",
      `Attempt is "${status}" and can no longer be edited.`,
    );
  }
}

// ---------------------------------------------------------------------
// saveArtifactSubmission
// ---------------------------------------------------------------------

function normalizeSaveArtifactSubmissionInput(input: unknown): {
  attemptId: string;
  artifactKey: string;
  content: string;
} {
  if (typeof input !== "object" || input === null) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "attemptId, artifactKey, and content are required.",
    );
  }
  const { attemptId, artifactKey, content } = input as {
    attemptId?: unknown;
    artifactKey?: unknown;
    content?: unknown;
  };
  if (typeof attemptId !== "string" || attemptId.trim().length === 0) {
    throw new ServiceError("VALIDATION_ERROR", "attemptId must be a non-blank string.");
  }
  if (typeof artifactKey !== "string" || artifactKey.trim().length === 0) {
    throw new ServiceError("VALIDATION_ERROR", "artifactKey must be a non-blank string.");
  }
  if (typeof content !== "string") {
    throw new ServiceError("VALIDATION_ERROR", "content must be a string.");
  }
  return { attemptId, artifactKey, content };
}

/**
 * Saves a new version of a Founder's Artifact content (e.g. the
 * "Pressure-Test Verdict" Markdown). Hash-idempotent: an identical
 * resubmission of the exact same content returns the existing latest
 * version unchanged — no new version, no new Storage write, no new
 * module_event. A genuinely changed `content` always produces a new
 * version, superseding the prior `draft` one.
 *
 * When the Artifact Definition has a `validator_key`, the Validator's
 * draft check runs against the incoming content *before* any Storage
 * write. Failures throw VALIDATION_ERROR with the named issues so MCP
 * callers can repair the locked schema instead of persisting freestyle
 * Markdown that only fails later at complete_module.
 */
export async function saveArtifactSubmission(
  actor: ActorContext,
  input: unknown,
  deps: ArtifactServiceDependencies = {},
): Promise<ArtifactSubmission> {
  assertRole(actor, ["founder"]);
  const { attemptId: rawAttemptId, artifactKey, content } =
    normalizeSaveArtifactSubmissionInput(input);
  const attemptId = parseEntityIdOrNotFound(rawAttemptId, "Attempt not found.");
  const contentHash = sha256(Buffer.from(content, "utf8"));

  // Phase 1 (no lock, no Storage I/O): fail fast on a bad attemptId/
  // artifactKey/status, and short-circuit the whole operation if this is
  // an identical resubmission — the common MCP-transport-retry case this
  // idempotency rule exists for.
  const precheckContext = await resolveAttemptContextForFounder(actor, attemptId, pool, {
    forUpdate: false,
  });
  assertEditableAttempt(precheckContext.attempt.status);
  const artifactDefinition = await loadArtifactDefinitionByKey(
    pool,
    precheckContext.runModule.module_definition_id,
    artifactKey,
  );
  const precheckExisting = await loadLatestSubmission(pool, attemptId, artifactDefinition.id, {
    forUpdate: false,
  });
  if (precheckExisting && precheckExisting.content_sha256 === contentHash) {
    return mapArtifactSubmissionRow(precheckExisting);
  }

  if (artifactDefinition.validator_key) {
    const validator = resolveValidator(artifactDefinition.validator_key, deps.validators);
    const responses = await loadResponses(pool, attemptId);
    const draftResult = validator.runDraftCheck({
      content,
      responses: responses.map((row) => ({
        questionKey: row.question_key,
        responseStatus: row.response_status,
        answerText: row.answer_text,
        answerData: row.answer_data,
      })),
      validationConfig: artifactDefinition.validation_config,
    });
    if (!draftResult.passed) {
      const detail =
        draftResult.issues.length > 0
          ? draftResult.issues.join(" ")
          : `Draft check "${draftResult.checks
              .filter((check) => !check.passed)
              .map((check) => check.key)
              .join(", ")}" failed.`;
      throw new ServiceError(
        "VALIDATION_ERROR",
        `Artifact content failed the locked-schema draft check: ${detail}`,
      );
    }
  }

  // Phase 2 (Storage I/O, no transaction held open): 2.5's own
  // pending -> uploaded -> verified choreography.
  const filename = artifactDefinition.required_filename ?? `${artifactKey}.txt`;
  const pendingObject = await createPendingGeneratedObject(actor, {
    workspaceId: precheckContext.workspaceId,
    filename,
  });
  const storageObject = await writeGeneratedTextContent(actor, {
    storageObjectId: pendingObject.id,
    content,
  });

  // Phase 3 (short transaction): re-verify under lock (guards the race
  // window opened by phase 2's I/O), then commit the actual version
  // change.
  return withTransaction(async (client) => {
    const { workspaceId, runModule, attempt } = await resolveAttemptContextForFounder(
      actor,
      attemptId,
      client,
      { forUpdate: true },
    );
    assertEditableAttempt(attempt.status);

    const lockedArtifactDefinition = await loadArtifactDefinitionByKey(
      client,
      runModule.module_definition_id,
      artifactKey,
    );
    const existing = await loadLatestSubmission(client, attemptId, lockedArtifactDefinition.id, {
      forUpdate: true,
    });
    if (existing && existing.content_sha256 === contentHash) {
      // A concurrent call already saved this exact content while we were
      // doing Storage I/O — idempotent no-op, matching the phase-1 check.
      return mapArtifactSubmissionRow(existing);
    }

    if (existing && existing.status === "draft") {
      await client.query(
        `update artifact_submissions
         set status = 'superseded', superseded_at = now(), updated_at = now()
         where id = $1`,
        [existing.id],
      );
    }

    const versionResult = await client.query<{ next: number }>(
      `select coalesce(max(version_number), 0) + 1 as next
       from artifact_submissions where module_attempt_id = $1 and artifact_definition_id = $2`,
      [attemptId, lockedArtifactDefinition.id],
    );
    const versionNumber = versionResult.rows[0].next;
    const createdVia = resolveSubmissionCreatedVia(actor);

    const insertedResult = await client.query<{ id: string; created_at: Date }>(
      `insert into artifact_submissions (
         workspace_id, module_attempt_id, program_run_module_id, module_definition_id,
         artifact_definition_id, version_number, status, created_via, created_by_user_id
       )
       values ($1, $2, $3, $4, $5, $6, 'draft', $7, $8)
       returning id, created_at`,
      [
        workspaceId,
        attemptId,
        runModule.id,
        runModule.module_definition_id,
        lockedArtifactDefinition.id,
        versionNumber,
        createdVia,
        actor.userId,
      ],
    );
    const submissionId = insertedResult.rows[0].id;

    await client.query(
      `insert into artifact_files (
         workspace_id, artifact_submission_id, storage_object_id, file_role, format,
         sequence_index, is_primary
       )
       values ($1, $2, $3, 'source', $4, 1, true)`,
      [workspaceId, submissionId, storageObject.id, lockedArtifactDefinition.output_format],
    );

    await insertArtifactModuleEvent(client, {
      workspaceId,
      programRunId: runModule.program_run_id,
      programRunBranchId: runModule.program_run_branch_id,
      programRunModuleId: runModule.id,
      moduleAttemptId: attemptId,
      eventType: "artifact_uploaded",
      actor,
    });

    return {
      id: submissionId,
      moduleAttemptId: attemptId,
      artifactDefinitionId: lockedArtifactDefinition.id,
      versionNumber,
      status: "draft",
      createdVia,
      createdAt: insertedResult.rows[0].created_at.toISOString(),
      submittedAt: null,
      supersededAt: null,
    };
  });
}

export interface ArtifactSubmissionWithContent {
  submission: ArtifactSubmission;
  // null only when the latest version's primary file somehow has no
  // storage_objects row yet — never happens through this Service's own
  // saveArtifactSubmission, which always writes the file in the same
  // transaction as the submission.
  content: string | null;
}

/**
 * Reads an Attempt's latest non-superseded/deleted Artifact Submission,
 * together with its stored content read back through StorageService
 * (`getGeneratedTextContent`) — the single read backing the MCP
 * `get_artifact` MCP tool — content read through StorageService. Returns null
 * when no submission exists yet.
 * has never been saved yet, which is a normal state during drafting, not
 * an error.
 */
export async function getArtifactSubmission(
  actor: ActorContext,
  input: unknown,
): Promise<ArtifactSubmissionWithContent | null> {
  assertRole(actor, ["founder"]);
  const { attemptId: rawAttemptId, artifactKey } = normalizeArtifactKeyInput(input);
  const attemptId = parseEntityIdOrNotFound(rawAttemptId, "Attempt not found.");

  const context = await resolveAttemptContextForFounder(actor, attemptId, pool, {
    forUpdate: false,
  });
  const artifactDefinition = await loadArtifactDefinitionByKey(
    pool,
    context.runModule.module_definition_id,
    artifactKey,
  );
  const submission = await loadLatestSubmission(pool, attemptId, artifactDefinition.id, {
    forUpdate: false,
  });
  if (!submission) {
    return null;
  }
  const content = submission.primary_storage_object_id
    ? await getGeneratedTextContent(actor, submission.primary_storage_object_id)
    : null;
  return { submission: mapArtifactSubmissionRow(submission), content };
}

// ---------------------------------------------------------------------
// runDraftCheck
// ---------------------------------------------------------------------

function normalizeArtifactKeyInput(input: unknown): { attemptId: string; artifactKey: string } {
  if (typeof input !== "object" || input === null) {
    throw new ServiceError("VALIDATION_ERROR", "attemptId and artifactKey are required.");
  }
  const { attemptId, artifactKey } = input as { attemptId?: unknown; artifactKey?: unknown };
  if (typeof attemptId !== "string" || attemptId.trim().length === 0) {
    throw new ServiceError("VALIDATION_ERROR", "attemptId must be a non-blank string.");
  }
  if (typeof artifactKey !== "string" || artifactKey.trim().length === 0) {
    throw new ServiceError("VALIDATION_ERROR", "artifactKey must be a non-blank string.");
  }
  return { attemptId, artifactKey };
}

function draftRuleSnapshot(validationConfig: Record<string, unknown>): Record<string, unknown> {
  return { draftRules: (validationConfig as { draftRules?: unknown }).draftRules ?? [] };
}

/**
 * Runs the non-authoritative draft_check for one Artifact: a Founder-
 * facing self-check tool during drafting, never gating Module completion
 * and never touching Attempt/run_module state. "Idempotent" here means
 * "repeated calls are harmless", not "returns the prior result" — each
 * call legitimately appends a new artifact_validations history row.
 */
export async function runDraftCheck(
  actor: ActorContext,
  input: unknown,
  deps: ArtifactServiceDependencies = {},
): Promise<ArtifactValidation> {
  assertRole(actor, ["founder"]);
  const { attemptId: rawAttemptId, artifactKey } = normalizeArtifactKeyInput(input);
  const attemptId = parseEntityIdOrNotFound(rawAttemptId, "Attempt not found.");

  // Phase 1 (no lock): resolve everything needed to run the Validator.
  const context = await resolveAttemptContextForFounder(actor, attemptId, pool, {
    forUpdate: false,
  });
  assertEditableAttempt(context.attempt.status);
  const artifactDefinition = await loadArtifactDefinitionByKey(
    pool,
    context.runModule.module_definition_id,
    artifactKey,
  );
  const submission = await loadLatestSubmission(pool, attemptId, artifactDefinition.id, {
    forUpdate: false,
  });
  if (!submission || !submission.primary_storage_object_id) {
    throw new ServiceError("NOT_FOUND", "No Artifact submission found to check.");
  }
  if (!artifactDefinition.validator_key) {
    throw new ServiceError(
      "VALIDATOR_NOT_CONFIGURED",
      `Artifact "${artifactKey}" has no validator_key configured.`,
    );
  }
  const validator = resolveValidator(artifactDefinition.validator_key, deps.validators);

  // Phase 2 (I/O, no transaction held open).
  const content = await getGeneratedTextContent(actor, submission.primary_storage_object_id);
  const responses = await loadResponses(pool, attemptId);
  const result = validator.runDraftCheck({
    content,
    responses: responses.map((row) => ({
      questionKey: row.question_key,
      responseStatus: row.response_status,
      answerText: row.answer_text,
      answerData: row.answer_data,
    })),
    validationConfig: artifactDefinition.validation_config,
  });

  // Phase 3 (short transaction): re-verify under lock, write the event +
  // validation history row.
  return withTransaction(async (client) => {
    const { workspaceId, runModule, attempt } = await resolveAttemptContextForFounder(
      actor,
      attemptId,
      client,
      { forUpdate: true },
    );
    assertEditableAttempt(attempt.status);

    await insertArtifactModuleEvent(client, {
      workspaceId,
      programRunId: runModule.program_run_id,
      programRunBranchId: runModule.program_run_branch_id,
      programRunModuleId: runModule.id,
      moduleAttemptId: attemptId,
      eventType: "validation_started",
      actor,
    });

    const validationRow = await insertArtifactValidation(client, {
      workspaceId,
      artifactSubmissionId: submission.id,
      validationKind: "draft_check",
      validatorKey: validator.validatorKey,
      validatorVersion: validator.validatorVersion,
      triggeredVia: resolveValidationTriggeredVia(actor),
      triggeredByUserId: actor.userId,
      ruleSnapshot: draftRuleSnapshot(artifactDefinition.validation_config),
      result,
    });

    await insertArtifactModuleEvent(client, {
      workspaceId,
      programRunId: runModule.program_run_id,
      programRunBranchId: runModule.program_run_branch_id,
      programRunModuleId: runModule.id,
      moduleAttemptId: attemptId,
      eventType: result.passed ? "validation_passed" : "validation_failed",
      actor,
    });

    return mapArtifactValidationRow(validationRow);
  });
}

// ---------------------------------------------------------------------
// runOfficialValidation
// ---------------------------------------------------------------------

function normalizeAttemptIdInput(input: unknown): { attemptId: string } {
  if (typeof input !== "object" || input === null || !("attemptId" in input)) {
    throw new ServiceError("VALIDATION_ERROR", "attemptId is required.");
  }
  const { attemptId } = input as { attemptId: unknown };
  if (typeof attemptId !== "string" || attemptId.trim().length === 0) {
    throw new ServiceError("VALIDATION_ERROR", "attemptId must be a non-blank string.");
  }
  return { attemptId };
}

// Only a system-sourced caller (2.8's own submit orchestration, acting on
// the Founder's behalf) or an admin-role actor may trigger official
// validation — a Founder or an MCP-sourced actor never can, regardless
// of role. Matches the database's own
// artifact_validations_official_authority_check constraint (which
// additionally allows triggered_via='website', a V1-unreachable
// combination reserved for a future direct web-triggered path — see this
// function's own comment below on resolveValidationTriggeredVia).
function assertOfficialValidationAuthority(actor: ActorContext): void {
  if (actor.source === "system" || actor.role === "admin") {
    return;
  }
  throw new ServiceError("FORBIDDEN", "You do not have permission to perform this action.");
}

export interface RunOfficialValidationResult {
  attemptId: string;
  status: ModuleAttemptStatus;
  passed: boolean;
  // Required artifact_definitions with no submission at all — recorded
  // only in the validation_failed module_event's metadata (there is no
  // artifact_submission_id to attach an artifact_validations row to).
  missingArtifactKeys: string[];
  validations: ArtifactValidation[];
}

interface ArtifactRunOutcome {
  artifactDefinition: ArtifactDefinitionRow;
  submission: LatestSubmissionRow | null;
  result: ValidationRunResult | null;
}

/**
 * Runs the authoritative official validation for every `is_required`
 * Artifact under Attempt's Module, against each one's latest
 * non-superseded/deleted version (never an older version, never a
 * non-required Artifact). All must pass for the Attempt to advance.
 *
 * Never modifies `program_run_modules` itself on the passing path (status
 * stays `in_progress`, `active_attempt_id` stays pointed at this
 * Attempt) — `startOrResumeAttempt`'s own `ATTEMPT_PENDING_REVIEW`
 * branch already expresses "awaiting review" from exactly that
 * combination (run_module `in_progress` + active Attempt
 * `ready_for_review`). On failure, `active_attempt_id` IS cleared
 * (module-level "clearing that pointer on a terminal Attempt is 2.6/4.2's
 * job" — see attempt/index.ts's own comment), so a Retry Attempt can be
 * started.
 *
 * This function alone never drives a Module past `ready_for_review` to
 * `completed`/`ready_to_unlock` — that requires a Mentor decision (not
 * implemented yet) or, for system-completed modules only, the separate
 * accept/complete/unlock step in completeModuleAttempt.
 */
export async function runOfficialValidation(
  actor: ActorContext,
  input: unknown,
  deps: ArtifactServiceDependencies = {},
): Promise<RunOfficialValidationResult> {
  assertOfficialValidationAuthority(actor);
  const { attemptId: rawAttemptId } = normalizeAttemptIdInput(input);
  const attemptId = parseEntityIdOrNotFound(rawAttemptId, "Attempt not found.");

  // Phase 1 (no lock): idempotent short-circuit / precondition check,
  // and gather everything needed to run every required Validator.
  const precheck = await resolveAttemptContextTrusted(attemptId, pool, { forUpdate: false });
  if (precheck.attempt.status === "ready_for_review" || precheck.attempt.status === "validation_failed") {
    return {
      attemptId,
      status: precheck.attempt.status,
      passed: precheck.attempt.status === "ready_for_review",
      missingArtifactKeys: [],
      validations: [],
    };
  }
  if (precheck.attempt.status !== "submitted") {
    throw new ServiceError(
      "ATTEMPT_NOT_AWAITING_VALIDATION",
      `Attempt is "${precheck.attempt.status}" and is not awaiting official validation.`,
    );
  }

  const requiredArtifacts = await loadRequiredArtifactDefinitions(
    pool,
    precheck.runModule.module_definition_id,
  );
  const responseRows = await loadResponses(pool, attemptId);
  const responses = responseRows.map((row) => ({
    questionKey: row.question_key,
    responseStatus: row.response_status,
    answerText: row.answer_text,
    answerData: row.answer_data,
  }));

  // Phase 2 (I/O, no transaction held open): read each required
  // Artifact's saved content and run its Validator's official check.
  const outcomes: ArtifactRunOutcome[] = [];
  for (const artifactDefinition of requiredArtifacts) {
    const submission = await loadLatestSubmission(pool, attemptId, artifactDefinition.id, {
      forUpdate: false,
    });
    if (!submission || !submission.primary_storage_object_id) {
      outcomes.push({ artifactDefinition, submission: null, result: null });
      continue;
    }
    if (!artifactDefinition.validator_key) {
      // Setup modules (e.g. Module 0) may have validator_key null — completion
      // is determined by operational checks (storage round-trip), not validators.
      // No artifact_validations row is inserted below. Other module types with
      // a missing validator_key still throw — misconfiguration must fail loudly.
      if (precheck.runModule.module_type === "setup") {
        outcomes.push({
          artifactDefinition,
          submission,
          result: { checks: [], issues: [], warnings: [], passed: true, score: 100 },
        });
        continue;
      }
      throw new ServiceError(
        "VALIDATOR_NOT_CONFIGURED",
        `Artifact "${artifactDefinition.artifact_key}" has no validator_key configured.`,
      );
    }
    const validator = resolveValidator(artifactDefinition.validator_key, deps.validators);
    const content = await getGeneratedTextContent(actor, submission.primary_storage_object_id);
    const result = validator.runOfficialCheck({
      content,
      responses,
      validationConfig: artifactDefinition.validation_config,
    });
    outcomes.push({ artifactDefinition, submission, result });
  }

  const missingArtifactKeys = outcomes
    .filter((outcome) => outcome.submission === null)
    .map((outcome) => outcome.artifactDefinition.artifact_key);
  const allPassed =
    missingArtifactKeys.length === 0 && outcomes.every((outcome) => outcome.result?.passed === true);

  // Phase 3 (short transaction): re-verify under lock, then commit the
  // Attempt/Submission state transition + validation history rows.
  return withTransaction(async (client) => {
    const locked = await resolveAttemptContextTrusted(attemptId, client, { forUpdate: true });

    if (locked.attempt.status === "ready_for_review" || locked.attempt.status === "validation_failed") {
      // Raced with another official validation call between phase 1 and
      // here — idempotent short-circuit, no new writes.
      return {
        attemptId,
        status: locked.attempt.status,
        passed: locked.attempt.status === "ready_for_review",
        missingArtifactKeys: [],
        validations: [],
      };
    }
    if (locked.attempt.status !== "submitted") {
      throw new ServiceError(
        "ATTEMPT_NOT_AWAITING_VALIDATION",
        `Attempt is "${locked.attempt.status}" and is not awaiting official validation.`,
      );
    }

    const runModuleEventBase = {
      workspaceId: locked.workspaceId,
      programRunId: locked.runModule.program_run_id,
      programRunBranchId: locked.runModule.program_run_branch_id,
      programRunModuleId: locked.runModule.id,
      moduleAttemptId: attemptId,
      actor,
    };

    await insertArtifactModuleEvent(client, {
      ...runModuleEventBase,
      eventType: "validation_started",
    });

    const validations: ArtifactValidation[] = [];
    for (const outcome of outcomes) {
      if (!outcome.submission || !outcome.result || !outcome.artifactDefinition.validator_key) {
        continue;
      }
      const validator = resolveValidator(outcome.artifactDefinition.validator_key, deps.validators);
      const row = await insertArtifactValidation(client, {
        workspaceId: locked.workspaceId,
        artifactSubmissionId: outcome.submission.id,
        validationKind: "official",
        validatorKey: validator.validatorKey,
        validatorVersion: validator.validatorVersion,
        triggeredVia: resolveValidationTriggeredVia(actor),
        triggeredByUserId: actor.userId,
        ruleSnapshot: outcome.artifactDefinition.validation_config,
        result: outcome.result,
      });
      validations.push(mapArtifactValidationRow(row));
    }

    if (allPassed) {
      for (const outcome of outcomes) {
        if (!outcome.submission) {
          continue;
        }
        await client.query(
          `update artifact_submissions
           set status = 'submitted', submitted_at = now(), updated_at = now()
           where id = $1`,
          [outcome.submission.id],
        );
      }
      await client.query(
        `update module_attempts set status = 'ready_for_review', updated_at = now() where id = $1`,
        [attemptId],
      );
      await insertArtifactModuleEvent(client, {
        ...runModuleEventBase,
        eventType: "validation_passed",
      });
    } else {
      await client.query(
        `update module_attempts set status = 'validation_failed', updated_at = now() where id = $1`,
        [attemptId],
      );
      // The key hidden requirement (attempt/index.ts's own "clearing that
      // pointer on a terminal Attempt is 2.6/4.2's job") — without this,
      // startOrResumeAttempt's Retry path throws INTERNAL_INVARIANT_ERROR.
      await client.query(
        `update program_run_modules set active_attempt_id = null, updated_at = now() where id = $1`,
        [locked.runModule.id],
      );
      await insertArtifactModuleEvent(client, {
        ...runModuleEventBase,
        eventType: "validation_failed",
        metadata: missingArtifactKeys.length > 0 ? { missingArtifactKeys } : undefined,
      });
    }

    return {
      attemptId,
      status: allPassed ? "ready_for_review" : "validation_failed",
      passed: allPassed,
      missingArtifactKeys,
      validations,
    };
  });
}

// ---------------------------------------------------------------------
// getLatestValidation
// ---------------------------------------------------------------------

// Same reader-permission shape as storage/index.ts's
// assertGeneratedContentReader (founder role / system source / admin
// role) — kept as its own local assertion rather than a cross-module
// import for the same "don't share across Service modules" reason.
function assertValidationReader(actor: ActorContext): void {
  if (actor.role === "founder" || actor.role === "admin" || actor.source === "system") {
    return;
  }
  throw new ServiceError("FORBIDDEN", "You do not have permission to perform this action.");
}

/**
 * Reads the most recent artifact_validations row for (attemptId, artifactKey)
 * across all submission versions. Returns null when no validation has run yet.
 */
export async function getLatestValidation(
  actor: ActorContext,
  input: unknown,
): Promise<ArtifactValidation | null> {
  assertValidationReader(actor);
  const { attemptId: rawAttemptId, artifactKey } = normalizeArtifactKeyInput(input);
  const attemptId = parseEntityIdOrNotFound(rawAttemptId, "Attempt not found.");

  const attemptLookup = await pool.query<{ workspace_id: string; program_run_module_id: string }>(
    `select workspace_id, program_run_module_id from module_attempts where id = $1`,
    [attemptId],
  );
  const attemptRow = attemptLookup.rows[0];
  if (!attemptRow) {
    throw new ServiceError("NOT_FOUND", "Attempt not found.");
  }

  if (actor.role === "founder") {
    const workspace = await resolveFounderWorkspace(actor, pool);
    if (attemptRow.workspace_id !== workspace.id) {
      throw new ServiceError("NOT_FOUND", "Attempt not found.");
    }
  }

  const runModuleResult = await pool.query<{ module_definition_id: string }>(
    `select module_definition_id from program_run_modules where id = $1 and workspace_id = $2`,
    [attemptRow.program_run_module_id, attemptRow.workspace_id],
  );
  const moduleDefinitionId = runModuleResult.rows[0]?.module_definition_id;
  if (!moduleDefinitionId) {
    throw new ServiceError(
      "INTERNAL_INVARIANT_ERROR",
      `Attempt ${attemptId} has no owning program_run_module.`,
    );
  }

  const artifactDefinition = await loadArtifactDefinitionByKey(
    pool,
    moduleDefinitionId,
    artifactKey,
  );

  const result = await pool.query<ArtifactValidationRow>(
    `select v.id, v.artifact_submission_id, v.validation_number, v.validation_kind, v.status,
            v.validator_key, v.validator_version, v.triggered_via, v.checks, v.issues, v.warnings,
            v.summary, v.score, v.created_at
     from artifact_validations v
     join artifact_submissions s on s.id = v.artifact_submission_id
     where s.module_attempt_id = $1 and s.artifact_definition_id = $2
     order by v.created_at desc
     limit 1`,
    [attemptId, artifactDefinition.id],
  );

  const row = result.rows[0];
  return row ? mapArtifactValidationRow(row) : null;
}
