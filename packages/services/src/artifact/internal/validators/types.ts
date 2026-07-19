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
  // The value every rule in this PR actually reads. 2.4's
  // saveFounderResponse stores a single_choice answer's option value
  // here too (it `return`s `value` directly for single_choice in
  // resolveAnswerText) — decision-type questions (initial_decision,
  // final_decision, current_stage) are read from this field, not
  // answerData.
  answerText: string | null;
  // Reserved for forward compatibility with the schema column's stated
  // intent ("structured answer used by AI and the system") — 2.4's
  // shipped saveFounderResponse always inserts this as a literal `null`
  // (see its insert statement), so no rule in this PR reads it. If a
  // future PR starts writing real structured data here, Validators can
  // start reading it without another interface change.
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
