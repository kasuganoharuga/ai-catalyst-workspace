import type { ReactNode } from "react";

import type { ModuleContextQuestion } from "@ai-catalyst/shared";

export type ExpectedArtifact = {
  artifactKey: string;
  name: string;
  requiredFilename: string | null;
  outline: { heading: string; items: string[] }[];
};

/**
 * Why this module is being shown read-only.
 *
 * "locked" — an earlier module has to be finished first.
 * "not-started" — no Run exists yet, usually because Claude isn't
 *   connected. The founder can read everything; nothing can be saved.
 */
export type ModulePreviewReason = "locked" | "not-started" | null;

/** A module's identity colour, applied as an inline style. */
export type ModuleAccent = { backgroundColor: string };

export type Module0SetupProps = {
  moduleKey: string;
  moduleIndex: number;
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
  programRunModuleId: string | null;
  ventureId: string | null;
  claudeProjectId: string | null;
  connected: boolean;
  coreQuestions: ModuleContextQuestion[];
  decisionQuestions: ModuleContextQuestion[];
  artifactKey: string | null;
  artifactName: string | null;
  artifactVersion: number | null;
  artifactSavedAt: string | null;
  expectedArtifacts: ExpectedArtifact[];
  hasAttempt: boolean;
  needsRetry: boolean;
  awaitingConfirmation: boolean;
  isCompleted: boolean;
  /** `null` means the module is live and workable; otherwise preview-only. */
  preview: ModulePreviewReason;
  /**
   * The saved document, already rendered on the server. Null until Claude
   * has saved something — passed in rather than fetched here so this stays
   * a client component without pulling react-markdown into its bundle.
   */
  documentPreview: ReactNode;
  startPrompt: string;
  nextModuleTitle: string | null;
};
