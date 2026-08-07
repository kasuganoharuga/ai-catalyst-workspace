// Shared types for the operational-workbook renderer pipeline:
//   Confirmed Markdown -> parse() -> buildPlan() -> assertPlanMatchesModel()
//   -> render() -> assertPdfStructure() -> stream
//
// A WorkbookRenderPlan is a pure, serialisable description of the document —
// pages, fields and locked (non-editable) content, each already assigned an
// absolute page and position — built by a renderer's buildPlan() before any
// PDF bytes exist. This is deliberate: content equality (do the five
// questions match the confirmed Markdown verbatim, does every page carry a
// footer, does no locked string leak into an editable field) is checked
// entirely against this plain-data structure. Text drawn into a PDF passes
// through glyph encoding, font subsetting, content-stream compression and
// positioning operators — there is no reliable string to search for in a
// finished PDF buffer, so verifying against the plan instead of the PDF is
// both stronger and deterministic.
//
// render() (implemented per-renderer, using the shared emitter in
// pdf/render-plan.ts) is a "replay" step: it re-derives line wrapping from
// the same pure functions in pdf/metrics.ts that buildPlan used to decide
// pagination, so the two can never independently disagree about where a
// line breaks.

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
 * One block of non-editable, drawn text. `role` is the stable identifier
 * `assertPlanMatchesModel` matches against the typed model (e.g.
 * "question_2", "pass_bar_condition_1") — never the visible text itself,
 * since visible text is exactly what a content bug would corrupt.
 *
 * `x`/`y` mark the top-left of the text block as already decided by
 * buildPlan's pagination; `render()` re-wraps `text` at draw time using the
 * same `wrapText`/`linePitch` functions buildPlan used, so the two can never
 * disagree about how many lines it took or where they land.
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

/**
 * A page's fixed left-hand provenance line is derived from `Provenance` and
 * drawn on every page unconditionally; `footerLabel` is the page-specific
 * right-hand label (e.g. "Interview 1 · A"), set at the moment the page is
 * created (see pdf/layout-builder.ts's `newPage`) so that a page created by
 * a mid-section overflow still inherits the current section's label rather
 * than being stamped after the fact and missed.
 */
export interface PagePlan {
  footerLabel: string | null;
}

/**
 * A solid-colour background fill — masthead bands, section-card backgrounds,
 * grid divider hairlines. Pure decoration, never content: unlike
 * `LockedContentEntry`, nothing here is checked by `assertPlanMatchesModel`
 * (there is no model-derived text to compare), and nothing here is checked
 * structurally either (a filled rectangle leaves no reliably-inspectable
 * trace in a reopened PDF the way a named field does). Drawn before every
 * page's locked content and fields, so text and fields always sit on top.
 */
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

// ---------------------------------------------------------------------------
// Field manifest — the single, code-as-data source for a renderer's fields
// (operational-workbooks plan §5). Never a Markdown table: a table cannot be
// consumed by a renderer, and without a data structure like this the "single
// field contract" would split into a plan doc, hand-written renderer code
// and the tests' expected-field lists, free to drift apart.
//
// `countFrom` is a small named union resolved by the renderer that reads a
// manifest, not a path expression or callback — this keeps the manifest
// itself plain, serialisable data (snapshot-testable, and walkable by
// generic code that never needs to know what "passBarConditions" means).
// ---------------------------------------------------------------------------

export type FieldValueKind = "text" | "checkbox" | "dropdown";

/**
 * How many repetitions of a field family within one section this manifest
 * produces. Deliberately excludes `"option"` — a family's count (how many
 * Pass Bar checkboxes, how many kill criteria) always comes from the
 * confirmed Markdown, never from a Founder choosing a number at download
 * time. Only a whole *section*'s count can be Founder-facing — see
 * `SectionCountSpec`.
 */
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

/**
 * A numbered family within a section. The family's index is NOT always a
 * trailing suffix — `question_1_notes`..`question_5_notes` carries it in
 * the middle, `kill_criterion_1_observed` likewise, while `pass_bar_1`
 * appends it. `suffixTemplate`'s `{n}` is replaced with the 1-based index
 * within the family, so each family spells out its own real field-naming
 * shape rather than forcing one generic pattern that doesn't fit all of them.
 */
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

// ---------------------------------------------------------------------------
// Renderer contract types — live here (not in registry.ts) so individual
// renderer modules can import them without creating a cycle back into the
// registry that value-imports those same modules (validators keep Validator
// in validators/types.ts for the same reason).
// ---------------------------------------------------------------------------

/** A confirmed Markdown `##`/`###` heading this renderer's template must contain — see renderer-template-contract.test.ts. */
export type RequiredSection = string;

/**
 * Founder-chosen render-time options that do NOT come from the confirmed
 * Markdown. Today that's only `sectionCount` (interview round length,
 * 5-10) — `problem_interview_workbook_v1` reads it,
 * `validation_roadmap_workbook_v1` ignores it entirely, since its section
 * count is fully determined by the confirmed Markdown's experiment count.
 * Validated at the route boundary, not here.
 */
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
  buildPlan(model: TModel, provenance: Provenance, options?: WorkbookRenderOptions): WorkbookRenderPlan;
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
