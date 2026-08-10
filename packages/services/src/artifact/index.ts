// Artifact Submission versioning + ValidationService (draft/official checks).
// apps/web and apps/mcp call the same functions; runOfficialValidation is
// invoked internally from completeModuleAttempt, never as an MCP tool.
// Package-path re-exports only (Turbopack cannot resolve relative ./x.js
// from this entry).

export type { QueryExecutor } from "@ai-catalyst/services/artifact/internal/transaction";
export type { ArtifactServiceDependencies } from "@ai-catalyst/services/artifact/internal/dependencies";

export * from "@ai-catalyst/services/artifact/submission";
export * from "@ai-catalyst/services/artifact/render-workbook";
export * from "@ai-catalyst/services/artifact/draft-check";
export * from "@ai-catalyst/services/artifact/official-validation";
export * from "@ai-catalyst/services/artifact/latest-validation";
