// Every field here is a *content* field, compared for equality against
// what's already in the database. Lifecycle fields (status, published_at,
// ...) are handled separately and are deliberately not part of these types.

import type {
  LegacyValidationConfig,
  StructuredMarkdownValidationConfig,
} from "../artifact/internal/validators/rule-schema.js";

export interface QuestionOption {
  value: string;
  label: string;
}

// Kept minimal — only the single-equals case this content set needs.
export interface QuestionCondition {
  depends_on: string;
  operator: "equals";
  value: string;
}

export type ResponseType =
  | "short_text"
  | "long_text"
  | "single_choice"
  | "multi_choice"
  | "boolean"
  | "number"
  | "date"
  | "url"
  | "structured";

export interface QuestionContent {
  questionKey: string;
  sequenceIndex: number;
  questionGroup: string | null;
  questionText: string;
  helpText: string | null;
  placeholderText: string | null;
  responseType: ResponseType;
  isRequired: boolean;
  allowSkip: boolean;
  options: QuestionOption[];
  conditions: QuestionCondition | Record<string, never>;
}

export type ArtifactType = "document" | "presentation" | "web" | "data" | "file";

export interface ArtifactContent {
  artifactKey: string;
  sequenceIndex: number;
  name: string;
  description: string | null;
  isRequired: boolean;
  artifactType: ArtifactType;
  sourceFormat: string | null;
  outputFormat: string;
  requiredFilename: string | null;
  rendererKey: string | null;
  validatorKey: string | null;
  allowedMimeTypes: string[];
  maxFileSizeBytes: number | null;
  maxFiles: number;
  // Structural draft-check / submission rules consumed by the artifact's
  // own `validatorKey`. `validateConfigForValidator` (in
  // artifact/internal/validators/rule-schema.ts) parses this against the
  // matching schema before every seed write — see content-seed/db/modules.ts.
  validationConfig:
    | StructuredMarkdownValidationConfig
    | LegacyValidationConfig
    | Record<string, never>;
  // Carries the artefact Markdown template (there is no dedicated `template`
  // column on artifact_definitions).
  outputConfig: Record<string, unknown>;
}

export type ModuleType = "setup" | "standard" | "review" | "completion";
export type CompletionMode =
  | "artifact"
  | "confirmation"
  | "artifact_and_confirmation"
  | "system";

export interface ModuleContent {
  moduleKey: string;
  sequenceIndex: number;
  title: string;
  subtitle: string | null;
  description: string | null;
  objective: string | null;
  moduleType: ModuleType;
  isRequired: boolean;
  allowRevisions: boolean;
  completionMode: CompletionMode;
  estimatedMinutes: number | null;
  // Whether this Module should be activated on publish, or is a draft
  // placeholder that must never be auto-activated.
  isPublishable: boolean;
  questions: QuestionContent[];
  artifacts: ArtifactContent[];
}

export type PromptType =
  | "global_instruction"
  | "platform_boundary"
  | "module_facilitator"
  | "artifact_generator"
  | "retry_guide"
  | "review_context_generator"
  | "validation_feedback_guide";

export type ContentFormat = "plain_text" | "markdown" | "json";

export interface PromptContent {
  promptKey: string;
  name: string;
  description: string | null;
  promptType: PromptType;
  versionNumber: number;
  content: string;
  contentFormat: ContentFormat;
  variableConfig: Record<string, unknown>;
}

export type ModulePromptBindingPurpose =
  | "facilitator"
  | "artifact_generator"
  | "retry_guide"
  | "review_context_generator"
  | "validation_feedback_guide";

export interface ModulePromptBindingContent {
  moduleKey: string;
  promptKey: string;
  purpose: ModulePromptBindingPurpose;
  sequenceIndex: number;
  isRequired: boolean;
}

export type ContentLock = "mutable" | "frozen";

export interface ProgramContent {
  programKey: string;
  programName: string;
  programDescription: string | null;
  versionNumber: number;
  versionLabel: string;
  versionName: string;
  versionDescription: string | null;
  releaseNotes: string | null;
  // The initial content_lock this program_version is created with if it
  // does not yet exist in the database. For an *existing* row, the
  // database's own content_lock column is authoritative, not this field
  // — see db/program.ts's isContentEditable. Only db:freeze may move an
  // existing row from mutable to frozen; this seed script never writes
  // content_lock on an existing row.
  contentLock: ContentLock;
}

export interface ToolkitSeedContent {
  program: ProgramContent;
  // Full expected module set for this Program Version, in sequence order.
  // Any module_definitions row under this Program Version whose key is not
  // in this list is treated as an error.
  modules: ModuleContent[];
  prompts: PromptContent[];
  promptBindings: ModulePromptBindingContent[];
}
