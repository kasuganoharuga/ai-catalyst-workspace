// Shared DOCX design tokens for markdown-docx-v1.ts.
//
// Deliberately mirrors ../renderers/html/markdown-document-html.ts's
// wrapPrintableDocumentHtml (the shared print stylesheet 5 existing
// artefacts already render through), so the PDF and Word exports read as
// one visual family instead of two unrelated ones.
//
// Numbers here are a first pass, not a final design — per
// docs/product/operational-workbooks.md §3/§9, structure (one place to
// change styles, real numbering definitions, table style centralised in one
// builder) is the thing that cannot be retrofitted; exact spacing/size can
// be tuned later once real exported documents have been reviewed. Only
// change values here — never inline a size/color/spacing override at a call
// site in markdown-docx-v1.ts.
//
// Unit note: OOXML measures most distances (margins, indents, spacing,
// table widths) in twentieths of a point ("twips" / dxa) — except run/font
// size, which is in half-points. The two helpers below exist so call sites
// never hand-multiply and get that exception wrong.

import {
  AlignmentType,
  BorderStyle,
  LevelFormat,
  LevelSuffix,
  LineRuleType,
  convertMillimetersToTwip,
  type INumberingOptions,
  type IStylesOptions,
  type ITableBordersOptions,
  type ISectionPropertiesOptions,
  type IShadingAttributesProperties,
} from "docx";

/** Points → half-points, the unit `run.size` expects. */
export function halfPt(points: number): number {
  return Math.round(points * 2);
}

/** Points → twentieths of a point ("twips"/dxa), the unit spacing/indent expect. */
export function twipsFromPt(points: number): number {
  return Math.round(points * 20);
}

export const DOCX_COLORS = {
  ink: "1A1A1A",
  mutedInk: "666666",
  rule: "DDDDDD",
  tableBorder: "CCCCCC",
  tableHeaderFill: "F2F2F2",
  codeFill: "F7F7F7",
} as const;

export const DOCX_FONTS = {
  serif: "Georgia",
  sans: "Segoe UI",
  mono: "Consolas",
} as const;

// A4 with the same 18/16/22/16mm margins as wrapPrintableDocumentHtml's `@page` rule.
export const DOCX_SECTION_PROPERTIES: ISectionPropertiesOptions = {
  page: {
    margin: {
      top: convertMillimetersToTwip(18),
      right: convertMillimetersToTwip(16),
      bottom: convertMillimetersToTwip(22),
      left: convertMillimetersToTwip(16),
    },
  },
};

const LIST_LEVEL_INDENT = (level: number) => ({
  left: convertMillimetersToTwip(6 + level * 6),
  hanging: convertMillimetersToTwip(4),
});

export const DOCX_NUMBERING_REFERENCES = {
  bullet: "markdown-bullet-list",
  numbered: "markdown-numbered-list",
} as const;

// Real numbering definitions (w:numbering), not literal "• " text — see
// the plan's rule against faking lists: a real Word list can be continued,
// re-indented, and round-trips through Google Docs; a hand-typed bullet
// character cannot.
export const DOCX_NUMBERING: INumberingOptions = {
  config: [
    {
      reference: DOCX_NUMBERING_REFERENCES.bullet,
      levels: [0, 1, 2].map((level) => ({
        level,
        format: LevelFormat.BULLET,
        text: "•",
        alignment: AlignmentType.START,
        style: { paragraph: { indent: LIST_LEVEL_INDENT(level) } },
      })),
    },
    {
      reference: DOCX_NUMBERING_REFERENCES.numbered,
      levels: [0, 1, 2].map((level) => ({
        level,
        format: LevelFormat.DECIMAL,
        text: `%${level + 1}.`,
        suffix: LevelSuffix.SPACE,
        alignment: AlignmentType.START,
        style: { paragraph: { indent: LIST_LEVEL_INDENT(level) } },
      })),
    },
  ],
};

// Custom paragraph style ids for shapes the built-in default.heading1-6 /
// listParagraph don't cover. Headings themselves use HeadingLevel.HEADING_1
// etc. directly (see markdown-docx-v1.ts) with appearance controlled below
// via `default.heading1`..`heading4` — Word's own style slots, not a
// parallel custom id, so they show up as "Heading 1" etc. in Word's style
// pane the way a Founder opening the file would expect.
export const DOCX_PARAGRAPH_STYLE_IDS = {
  blockquote: "MarkdownBlockquote",
  codeBlock: "MarkdownCodeBlock",
} as const;

export const DOCX_STYLES: IStylesOptions = {
  default: {
    document: {
      run: {
        font: DOCX_FONTS.sans,
        size: halfPt(10.5),
        color: DOCX_COLORS.ink,
      },
      paragraph: {
        spacing: {
          after: twipsFromPt(7),
          line: 360,
          lineRule: LineRuleType.AUTO,
        },
      },
    },
    heading1: {
      run: {
        font: DOCX_FONTS.serif,
        size: halfPt(18),
        bold: true,
        color: DOCX_COLORS.ink,
      },
      paragraph: {
        spacing: { after: twipsFromPt(12), before: 0 },
        keepNext: true,
      },
    },
    heading2: {
      run: {
        font: DOCX_FONTS.serif,
        size: halfPt(13),
        bold: true,
        color: DOCX_COLORS.ink,
      },
      paragraph: {
        spacing: { before: twipsFromPt(14), after: twipsFromPt(6) },
        keepNext: true,
        border: {
          top: {
            style: BorderStyle.SINGLE,
            size: 4,
            color: DOCX_COLORS.rule,
            space: 8,
          },
        },
      },
    },
    heading3: {
      run: { size: halfPt(11), bold: true, color: DOCX_COLORS.ink },
      paragraph: {
        spacing: { before: twipsFromPt(12), after: twipsFromPt(5) },
        keepNext: true,
      },
    },
    heading4: {
      run: { size: halfPt(10.5), bold: true, color: DOCX_COLORS.ink },
      paragraph: {
        spacing: { before: twipsFromPt(10), after: twipsFromPt(4) },
        keepNext: true,
      },
    },
    listParagraph: {
      run: { size: halfPt(10.5), color: DOCX_COLORS.ink },
      paragraph: { spacing: { after: twipsFromPt(3) } },
    },
  },
  paragraphStyles: [
    {
      id: DOCX_PARAGRAPH_STYLE_IDS.blockquote,
      name: "Markdown Blockquote",
      basedOn: "Normal",
      next: "Normal",
      run: { italics: true, color: DOCX_COLORS.mutedInk },
      paragraph: {
        indent: { left: convertMillimetersToTwip(4) },
        spacing: { after: twipsFromPt(10) },
        border: {
          left: {
            style: BorderStyle.SINGLE,
            size: 8,
            color: DOCX_COLORS.rule,
            space: 8,
          },
        },
      },
    },
    {
      id: DOCX_PARAGRAPH_STYLE_IDS.codeBlock,
      name: "Markdown Code Block",
      basedOn: "Normal",
      next: "Normal",
      run: { font: DOCX_FONTS.mono, size: halfPt(8.5), color: DOCX_COLORS.ink },
      paragraph: {
        spacing: { after: twipsFromPt(10) },
        shading: { fill: DOCX_COLORS.codeFill } as IShadingAttributesProperties,
      },
    },
  ],
  characterStyles: [
    {
      id: "MarkdownInlineCode",
      name: "Markdown Inline Code",
      basedOn: "Normal",
      run: { font: DOCX_FONTS.mono, size: halfPt(9) },
    },
  ],
};

// Applied by the single table-building function in markdown-docx-v1.ts —
// centralising the constant here achieves the same "one place to change
// table appearance" goal as a named Word table style. (docx.js v9's public
// styling surface has no ergonomic way to author a genuine reusable
// `w:tblStyle` from scratch without hand-authoring raw OOXML, which would be
// disproportionate for this feature — see the code comment at that call
// site.)
export const DOCX_TABLE_BORDERS: ITableBordersOptions = {
  top: { style: BorderStyle.SINGLE, size: 4, color: DOCX_COLORS.tableBorder },
  bottom: {
    style: BorderStyle.SINGLE,
    size: 4,
    color: DOCX_COLORS.tableBorder,
  },
  left: { style: BorderStyle.SINGLE, size: 4, color: DOCX_COLORS.tableBorder },
  right: {
    style: BorderStyle.SINGLE,
    size: 4,
    color: DOCX_COLORS.tableBorder,
  },
  insideHorizontal: {
    style: BorderStyle.SINGLE,
    size: 4,
    color: DOCX_COLORS.tableBorder,
  },
  insideVertical: {
    style: BorderStyle.SINGLE,
    size: 4,
    color: DOCX_COLORS.tableBorder,
  },
};

export const DOCX_TABLE_HEADER_SHADING: IShadingAttributesProperties = {
  fill: DOCX_COLORS.tableHeaderFill,
};
