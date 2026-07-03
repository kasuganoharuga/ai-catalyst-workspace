export type ArtefactFormat = "markdown" | "pdf" | "slides" | "json";

export type ToolkitArtefact = {
  id: string;
  title: string;
  moduleId: string;
  format: ArtefactFormat;
  description: string;
};
