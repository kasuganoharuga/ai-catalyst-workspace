import type { ReactNode } from "react";

import type {
  ModuleContextQuestion,
  PreferredAiProvider,
  WorkbookFormat,
} from "@ai-catalyst/shared";

export type ExpectedArtifact = {
  artifactKey: string;
  name: string;
  requiredFilename: string | null;
  /** False for supporting artifacts that never block completion. */
  isRequired: boolean;
  outline: { heading: string; items: string[] }[];
  /** Renderer configured — does not imply a download is available yet. */
  workbookSupported: boolean;
  workbookFormat: WorkbookFormat | null;
};

/** One artifact's rendering state — catalog outline merged with Run submission data. */
export type ModuleArtifactView = {
  artifactKey: string;
  name: string;
  requiredFilename: string | null;
  isRequired: boolean;
  outline: { heading: string; items: string[] }[];
  versionNumber: number | null;
  savedAt: string | null;
  workbookSupported: boolean;
  /** True once a confirmed version exists to build a workbook from. */
  workbookAvailable: boolean;
  workbookFormat: WorkbookFormat | null;
  /** Server-rendered document; null until saved. */
  documentPreview: ReactNode;
};

/**
 * One Founder-uploaded prep file on the Work step. Metadata only — the
 * bytes are fetched on demand, and nothing server-side extracts their text.
 */
export type PrepDocumentView = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number | null;
};

/** Why the module is read-only: locked behind prior module, or no run yet. */
export type ModulePreviewReason = "locked" | "not-started" | null;

/** Module identity colour as an inline style. */
export type ModuleAccent = { backgroundColor: string };

export type Module0SetupProps = {
  moduleKey: string;
  moduleIndex: number;
  /** Hand-off target; null until founder chooses. */
  provider: PreferredAiProvider | null;
  programRunModuleId: string | null;
  claudeProjectId: string | null;
  connected: boolean;
  hasMcpActivity: boolean;
  artifactKey: string | null;
  artifactName: string | null;
  artifactVersion: number | null;
  artifactSavedAt: string | null;
  expectedArtifacts: ExpectedArtifact[];
  awaitingConfirmation: boolean;
  isCompleted: boolean;
  needsRetry: boolean;
  startPrompt: string;
  nextModuleTitle: string | null;
};

export type Module1RunProps = {
  moduleKey: string;
  moduleIndex: number;
  /** Hand-off target; null until founder chooses. */
  provider: PreferredAiProvider | null;
  programRunModuleId: string | null;
  ventureId: string | null;
  claudeProjectId: string | null;
  connected: boolean;
  coreQuestions: ModuleContextQuestion[];
  decisionQuestions: ModuleContextQuestion[];
  artifacts: ModuleArtifactView[];
  /** Founder-uploaded material for this module's Work step. */
  prepDocuments: PrepDocumentView[];
  hasAttempt: boolean;
  needsRetry: boolean;
  awaitingConfirmation: boolean;
  isCompleted: boolean;
  /** Null = live and workable; otherwise preview-only. */
  preview: ModulePreviewReason;
  startPrompt: string;
  nextModuleTitle: string | null;
};
