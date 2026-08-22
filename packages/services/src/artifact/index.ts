// Artifact Submission versioning + ValidationService (draft/official checks).
// apps/web and apps/mcp call the same functions; runOfficialValidation is
// invoked internally from completeModuleAttempt, never as an MCP tool.
// Package-path re-exports only (Turbopack cannot resolve relative ./x.js
// from this entry).

export type { QueryExecutor } from "@ai-catalyst/services/artifact/internal/transaction";
export type { ArtifactServiceDependencies } from "@ai-catalyst/services/artifact/internal/dependencies";
// Public re-export of a pure, dependency-free markdown-sections helper —
// apps/web needs the heading list both to order the Artifact comment
// sidebar and to know which headings carry an open thread, without
// reaching into an internal/ path.
export { listHeadings } from "@ai-catalyst/services/artifact/internal/markdown-sections";
export type { HeadingLine } from "@ai-catalyst/services/artifact/internal/markdown-sections";

export * from "@ai-catalyst/services/artifact/submission";
export * from "@ai-catalyst/services/artifact/render-workbook";
export * from "@ai-catalyst/services/artifact/export-document";
export * from "@ai-catalyst/services/artifact/draft-check";
export * from "@ai-catalyst/services/artifact/official-validation";
export * from "@ai-catalyst/services/artifact/latest-validation";
