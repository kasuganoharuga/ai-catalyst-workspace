// Shared types for the workbook renderer pipeline: parse → buildPlan → render.
// Plans are plain serialisable data so content equality is checked before PDF bytes
// exist — finished PDFs have no reliable searchable strings after encoding/subsetting.

export interface Provenance {
  sourceArtifactId: string;
  sourceArtifactVersion: number;
  /** Computed and verified against the actual bytes read from storage — never trusted from a database column alone. */
  sourceContentHash: string;
  rendererKey: string;
  rendererVersion: string;
  /** Passed in, never read from a clock inside a renderer — keeps parse/buildPlan/render pure functions of their arguments. */
  generatedAt: string;
  workspaceId: string;
  programRunId: string;
  programVersionNumber: number;
}

/** The nine keys stamped into the PDF's Info dictionary — see pdf/render-plan.ts and assert-pdf-structure.ts. */
export const PROVENANCE_INFO_KEYS = [
  "SourceArtifactId",
  "SourceArtifactVersion",
  "SourceContentHash",
  "RendererKey",
  "RendererVersion",
  "GeneratedAt",
  "WorkspaceId",
  "ProgramRunId",
  "ProgramVersionNumber",
] as const;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FieldPlanBase {
  /** Fully-qualified, dot-separated field name (e.g. "interview_1.date_day") — the round-trip contract. */
  name: string;
  /** 0-indexed page within the plan's `pages` array. */
  page: number;
  rect: Rect;
}

export interface TextFieldPlan extends FieldPlanBase {
  kind: "text";
  multiline: boolean;
  /** Character cap — see the operational-workbooks plan §6 for how this is derived (never guessed). */
  capacity: number;
}

export interface CheckboxFieldPlan extends FieldPlanBase {
  kind: "checkbox";
}

export interface DropdownFieldPlan extends FieldPlanBase {
  kind: "dropdown";
  /** Renderer-supplied vocabulary (e.g. Pass/Fail/Inconclusive) — never derived from the Markdown. */
  options: string[];
}

export type FieldPlan = TextFieldPlan | CheckboxFieldPlan | DropdownFieldPlan;

/**
 * Non-editable drawn text. `role` is the stable assertPlanMatchesModel key —
 * not visible text, which is exactly what a content bug would corrupt.
 */
export interface LockedContentEntry {
  role: string;
  text: string;
  page: number;
  x: number;
  y: number;
  maxWidth: number;
  size: number;
  bold: boolean;
  /** RGB, 0-1 range, matching pdf-lib's `rgb()` — defaults to near-black body ink when omitted. */
  color?: { r: number; g: number; b: number };
}

/** Page-specific right-hand footer label; captured at `newPage()` so overflow pages inherit the current section. */
export interface PagePlan {
  footerLabel: string | null;
}

/** Decorative fill — not checked by assertPlanMatchesModel or structural PDF asserts. */
export interface RectFillEntry {
  page: number;
  rect: Rect;
  /** RGB, 0-1 range, matching pdf-lib's `rgb()`. */
  color: { r: number; g: number; b: number };
}

export interface WorkbookRenderPlan {
  pages: PagePlan[];
  fields: FieldPlan[];
  lockedContent: LockedContentEntry[];
  rects: RectFillEntry[];
  provenance: Provenance;
}

// --- Field manifest ---
// Code-as-data field contract — one source for buildPlan, asserts, and tests.

export type FieldValueKind = "text" | "checkbox" | "dropdown";

/** How many repetitions of a field family; counts come from confirmed Markdown, not Founder download options. */
export type FamilyCountSpec =
  | { kind: "fixed"; value: number }
  | { kind: "fromModel"; source: string; minimum: number; maximum: number };

/** How many sections (interview conversations, experiment pages) this manifest produces. */
export type SectionCountSpec =
  | { kind: "fixed"; value: number }
  | { kind: "fromModel"; source: string; minimum: number; maximum: number }
  | { kind: "option"; minimum: number; maximum: number; default: number };

/** Exactly one field per section — e.g. `interview_N.participant`. */
export interface FixedFieldSpec {
  kind: "fixed";
  type: FieldValueKind;
  /** Field-name suffix after the section prefix and index, e.g. "date_day" in "interview_1.date_day". */
  suffix: string;
  /** Required for `type: "text"`; must trace to a real capacity derivation (pdf/metrics.ts) — never `undefined` or the literal `"spike"`. */
  capacity?: number;
  /** Required for `type: "dropdown"`. */
  options?: string[];
}

/** Numbered field family; `{n}` placement in `suffixTemplate` varies by family shape. */
export interface FamilyFieldSpec {
  kind: "family";
  type: FieldValueKind;
  suffixTemplate: string;
  count: FamilyCountSpec;
  capacity?: number;
  options?: string[];
}

export type FieldSpec = FixedFieldSpec | FamilyFieldSpec;

export interface FieldManifest {
  /** e.g. "interview", "experiment" — the part before the index in every field name this manifest produces. */
  sectionPrefix: string;
  sectionCount: SectionCountSpec;
  fields: FieldSpec[];
}

// --- Renderer contract ---
// Lives here (not registry.ts) so renderer modules import types without a cycle.

/** A confirmed Markdown `##`/`###` heading this renderer's template must contain — see renderer-template-contract.test.ts. */
export type RequiredSection = string;

/** Founder-chosen render options not from Markdown — today only `sectionCount` for interview workbooks. */
export interface WorkbookRenderOptions {
  sectionCount?: number;
}

/** Authored per renderer — fully typed, TModel is real. */
export interface WorkbookRenderer<TModel> {
  rendererKey: string;
  rendererVersion: string;
  mimeType: string;
  extension: string;
  downloadFilename: string;
  requiredSections: RequiredSection[];
  fieldManifest: FieldManifest;
  parse(markdown: string): TModel;
  buildPlan(
    model: TModel,
    provenance: Provenance,
    options?: WorkbookRenderOptions,
  ): WorkbookRenderPlan;
  assertPlanMatchesModel(plan: WorkbookRenderPlan, model: TModel): void;
  render(plan: WorkbookRenderPlan): Promise<Buffer>;
}

/** What the registry holds and the service sees — no generic, no model in any signature. */
export interface RegisteredWorkbookRenderer {
  rendererKey: string;
  rendererVersion: string;
  mimeType: string;
  extension: string;
  downloadFilename: string;
  requiredSections: RequiredSection[];
  fieldManifest: FieldManifest;
  build(
    markdown: string,
    provenance: Provenance,
    options?: WorkbookRenderOptions,
  ): Promise<{ buffer: Buffer; plan: WorkbookRenderPlan }>;
}
