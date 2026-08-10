import type {
  ModuleAttempt,
  ModuleAttemptStartedVia,
  ModuleAttemptStatus,
  ModuleAttemptType,
} from "@ai-catalyst/shared";

// Explicit column list (never `select *`) mapped through mapAttemptRow —
// a future internal-only column added to `module_attempts` is never
// accidentally exposed through the DTO just because a query forgot to
// name its columns.
export const ATTEMPT_COLUMNS = `
  id, program_run_module_id, attempt_number, attempt_type, status,
  based_on_attempt_id, started_via, submitted_at, created_at, updated_at
`;

export interface AttemptRow {
  id: string;
  program_run_module_id: string;
  attempt_number: number;
  attempt_type: ModuleAttemptType;
  status: ModuleAttemptStatus;
  based_on_attempt_id: string | null;
  started_via: ModuleAttemptStartedVia;
  submitted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export function mapAttemptRow(row: AttemptRow): ModuleAttempt {
  return {
    id: row.id,
    programRunModuleId: row.program_run_module_id,
    attemptNumber: row.attempt_number,
    attemptType: row.attempt_type,
    status: row.status,
    basedOnAttemptId: row.based_on_attempt_id,
    startedVia: row.started_via,
    submittedAt: row.submitted_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
