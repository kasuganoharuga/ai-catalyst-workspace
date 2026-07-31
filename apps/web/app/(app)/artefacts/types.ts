export type ArtefactStartAction =
  { kind: "start"; href: string } | { kind: "locked" };

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
};

export type ArtefactModuleGroupModel = {
  moduleKey: string;
  moduleTitle: string;
  moduleSubtitle: string | null;
  sequenceIndex: number;
  artefacts: ArtefactCardModel[];
};
