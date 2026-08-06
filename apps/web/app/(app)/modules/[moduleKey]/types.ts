import type { ReactNode } from "react";

import type {
  ModuleContextQuestion,
  PreferredAiProvider,
} from "@ai-catalyst/shared";

export type ExpectedArtifact = {
  artifactKey: string;
  name: string;
  requiredFilename: string | null;
  outline: { heading: string; items: string[] }[];
};

/**
 * One Module Artifact's rendering state — merges the catalog's static
 * `outline` with the Run's real submission data. A Module with more than
 * one Artifact (Modules 3 and 4 each have two) renders one of these per
 * Artifact rather than assuming there is only ever one; Module 1 and
 * Module 0 (which do have exactly one) just render an array of length 1.
 */
export type ModuleArtifactView = {
  artifactKey: string;
  name: string;
  requiredFilename: string | null;
  outline: { heading: string; items: string[] }[];
  versionNumber: number | null;
  savedAt: string | null;
  /**
   * The saved document, already rendered on the server. Null until this
   * Artifact has something saved — passed in rather than fetched here so
   * this stays a client component without pulling react-markdown into its
   * bundle.
   */
  documentPreview: ReactNode;
};

/**
 * Why this module is being shown read-only.
 *
 * "locked" — an earlier module has to be finished first.
 * "not-started" — no Run exists yet, usually because no assistant is
 *   connected. The founder can read everything; nothing can be saved.
 */
export type ModulePreviewReason = "locked" | "not-started" | null;

/** A module's identity colour, applied as an inline style. */
export type ModuleAccent = { backgroundColor: string };

export type Module0SetupProps = {
  moduleKey: string;
  moduleIndex: number;
  /** Which assistant the hand-off opens. Null until the founder chooses. */
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
  /** Which assistant the hand-off opens. Null until the founder chooses. */
  provider: PreferredAiProvider | null;
  programRunModuleId: string | null;
  ventureId: string | null;
  claudeProjectId: string | null;
  connected: boolean;
  coreQuestions: ModuleContextQuestion[];
  decisionQuestions: ModuleContextQuestion[];
  /** One entry per Artifact this Module produces, in sequence order. */
  artifacts: ModuleArtifactView[];
  hasAttempt: boolean;
  needsRetry: boolean;
  awaitingConfirmation: boolean;
  isCompleted: boolean;
  /** `null` means the module is live and workable; otherwise preview-only. */
  preview: ModulePreviewReason;
  startPrompt: string;
  nextModuleTitle: string | null;
};
