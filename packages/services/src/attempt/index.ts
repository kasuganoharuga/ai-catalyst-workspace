/**
 * Attempt/Response barrel: start/resume an Attempt, save answers, submit.
 * apps/web and apps/mcp both call these same functions.
 * Package-path re-exports only (Turbopack cannot resolve relative ./x.js
 * from this entry).
 */
export {
  startOrResumeAttempt,
  type StartOrResumeAttemptResult,
} from "@ai-catalyst/services/attempt/start-or-resume";
export { saveFounderResponse } from "@ai-catalyst/services/attempt/save-response";
export { submitAttempt } from "@ai-catalyst/services/attempt/submit";
