/**
 * Module completion barrel — MCP's complete_module and the website's
 * confirm-completion step.
 * Package-path re-exports only (Turbopack cannot resolve relative ./x.js
 * from this entry).
 */
export {
  completeModuleAttempt,
  type CompleteModuleAttemptResult,
  type ModuleValidationError,
} from "@ai-catalyst/services/module/complete-attempt";
export {
  confirmModuleCompletion,
  type ConfirmModuleCompletionResult,
} from "@ai-catalyst/services/module/confirm-completion";
export type { NextModuleUnlocked } from "@ai-catalyst/services/module/internal/complete-system-module";
