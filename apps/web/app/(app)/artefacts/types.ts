import type { WorkbookFormat } from "@ai-catalyst/shared";

export type ArtefactStartAction =
  { kind: "start"; href: string } | { kind: "locked" };

/**
 * Website-confirmed Module 4 evidence before Claude materialises a real
 * artifact_submissions row — keeps the Artefacts list in sync with Proof.
 */
export type WebsiteEvidenceState = {
  status: "draft_preview" | "confirmed";
  confirmedAt: string | null;
};

export type ArtefactCardModel = {
  moduleKey: string;
  moduleTitle: string;
  moduleSubtitle: string | null;
  sequenceIndex: number;
  artifactKey: string;
  name: string;
  requiredFilename: string | null;
  isRequired: boolean;
  versionNumber: number | null;
  submissionStatus: string | null;
  /** Last write time for "Saved …"; null when nothing is stored yet. */
  savedAt: string | null;
  /** Replaces Read/Download when the document has never been saved. */
  startAction?: ArtefactStartAction;
  /** A confirmed submission exists and a renderer is configured — the fillable PDF download can render. */
  workbookAvailable: boolean;
  workbookFormat: WorkbookFormat | null;
  websiteEvidence?: WebsiteEvidenceState;
};

/**
 * "handoff" is an artefact a Founder carries between two modules rather than
 * one a module produces — it gets its own card, with no step number, so it
 * reads as the thing passed across the gap instead of either module's output.
 */
export type ArtefactGroupKind = "module" | "handoff";

export type ArtefactModuleGroupModel = {
  kind: ArtefactGroupKind;
  moduleKey: string;
  title: string;
  subtitle: string | null;
  /** Owning module, for the accent colour and the numbered badge. */
  sequenceIndex: number;
  /**
   * Display order. Whole numbers for modules; a handoff sits on the fraction
   * between the two it bridges (3.5 lands after Module 3, before Module 4).
   */
  sortIndex: number;
  artefacts: ArtefactCardModel[];
};
