import type { ModuleResponseStatus } from "@ai-catalyst/shared";

// A Validator is a synchronous, pure function: no DB/Storage access of
// its own — the Service layer (artifact/index.ts) resolves `content` and
// `responses` first and passes them in. This is what lets
// pressure-test-verdict-v1.test.ts exercise every rule as a plain unit
// test, with no database involved at all.
export interface ValidationRunResult {
  checks: Array<{ key: string; passed: boolean; message?: string }>;
  issues: string[];
  warnings: string[];
  passed: boolean;
  // 0-100, matching artifact_validations.score's `numeric(5,2) check
  // (score between 0 and 100)` constraint.
  score: number;
}

export interface ValidationContextResponse {
  questionKey: string;
  responseStatus: ModuleResponseStatus;
  // Primary field validators read (includes single_choice and decision keys).
  answerText: string | null;
  // Structured answer column — unused by current validators (always null on insert).
  answerData: unknown;
}

export interface ValidationContext {
  content: string;
  responses: ValidationContextResponse[];
  validationConfig: Record<string, unknown>;
}

export interface Validator {
  validatorKey: string;
  validatorVersion: string;
  runDraftCheck(ctx: ValidationContext): ValidationRunResult;
  runOfficialCheck(ctx: ValidationContext): ValidationRunResult;
}
