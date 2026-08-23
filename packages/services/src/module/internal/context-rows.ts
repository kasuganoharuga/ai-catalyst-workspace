import type {
  ArtifactSubmissionStatus,
  ModuleResponseStatus,
  ModuleResponseType,
} from "@ai-catalyst/shared";

export interface QuestionRow {
  question_key: string;
  sequence_index: number;
  question_text: string;
  response_type: ModuleResponseType;
  allow_skip: boolean;
  options: unknown;
}

export interface QuestionRowWithModuleId extends QuestionRow {
  module_definition_id: string;
}

export interface ResponseLookupRow {
  question_key: string;
  response_status: ModuleResponseStatus;
  answer_text: string | null;
}

export interface ResponseLookupRowWithAttemptId extends ResponseLookupRow {
  module_attempt_id: string;
}

export interface ArtifactRow {
  artifact_key: string;
  name: string;
  is_required: boolean;
  required_filename: string | null;
  sequence_index: number;
  renderer_key: string | null;
  template_markdown: string | null;
  submission_version_number: number | null;
  submission_status: ArtifactSubmissionStatus | null;
  submission_submitted_at: Date | null;
  submission_updated_at: Date | null;
}

export interface ArtifactRowWithModuleId extends ArtifactRow {
  module_definition_id: string;
}

export interface PromptRow {
  module_definition_id: string;
  purpose: string;
  prompt_key: string;
  version_number: number;
  content: string;
}
