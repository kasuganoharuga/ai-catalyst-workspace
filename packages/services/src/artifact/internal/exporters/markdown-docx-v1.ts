// markdown → .docx — generic format conversion (see ./types.ts), not a
// per-artefact renderer. Reuses `marked`'s lexer (already a services
// dependency for the HTML→Gotenberg path) for markdown → token-tree parsing
// instead of a second hand-rolled parser; this file only walks that tree
// into docx.js components.
//
// Styling: every appearance decision lives in ./docx-styles.ts. Nothing in
// this file sets a literal font/size/color/spacing — see that file's header
// comment for why, and docs/product/operational-workbooks.md §3/§9 for why
// the numbers there are a tunable first pass while this structure is not.

import { marked, type MarkedToken, type Token, type Tokens } from "marked";
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from "docx";

import {
  DOCX_NUMBERING,
  DOCX_NUMBERING_REFERENCES,
  DOCX_PARAGRAPH_STYLE_IDS,
  DOCX_SECTION_PROPERTIES,
  DOCX_STYLES,
  DOCX_TABLE_BORDERS,
  DOCX_TABLE_HEADER_SHADING,
} from "@ai-catalyst/services/artifact/internal/exporters/docx-styles";
import type {
  DocumentExporter,
  Provenance,
} from "@ai-catalyst/services/artifact/internal/exporters/types";

const HEADING_LEVELS: Record<
  number,
  (typeof HeadingLevel)[keyof typeof HeadingLevel]
> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

interface InlineFormat {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
}

function inlineTextOf(token: Token): string | null {
  return "text" in token && typeof token.text === "string" ? token.text : null;
}

// Recursive: strong/em/del nest by wrapping child tokens, so formatting
// accumulates down the recursion rather than resetting per node — a
// `***bold italic***` span is `strong` containing `em` containing `text`.
function buildInlineRuns(
  tokens: readonly Token[],
  format: InlineFormat = {},
): ParagraphChild[] {
  const runs: ParagraphChild[] = [];
  // marked's own Token union includes Tokens.Generic (type: string) for
  // custom-extension tokens we never register — cast once per loop so the
  // switch below narrows on marked's real token shapes instead of getting
  // stuck on "could also be Generic" at every case.
  for (const token of tokens as readonly MarkedToken[]) {
    switch (token.type) {
      case "text":
      case "escape":
        runs.push(new TextRun({ text: token.text, ...format }));
        break;
      case "strong":
        runs.push(
          ...buildInlineRuns(token.tokens ?? [], { ...format, bold: true }),
        );
        break;
      case "em":
        runs.push(
          ...buildInlineRuns(token.tokens ?? [], {
            ...format,
            italics: true,
          }),
        );
        break;
      case "del":
        runs.push(
          ...buildInlineRuns(token.tokens ?? [], { ...format, strike: true }),
        );
        break;
      case "codespan":
        runs.push(
          new TextRun({ text: token.text, style: "MarkdownInlineCode" }),
        );
        break;
      case "link":
        // Word applies its own "Hyperlink" character style automatically
        // inside a w:hyperlink — no explicit color/underline needed here.
        runs.push(
          new ExternalHyperlink({
            link: token.href,
            children: buildInlineRuns(token.tokens ?? [], format),
          }),
        );
        break;
      case "image":
        // No image embedding in v1 — name the asset rather than dropping it silently.
        runs.push(
          new TextRun({
            text: `[image: ${token.text || token.href}]`,
            italics: true,
          }),
        );
        break;
      case "br":
        runs.push(new TextRun({ text: "", break: 1 }));
        break;
      default: {
        const text = inlineTextOf(token);
        if (text !== null) {
          runs.push(new TextRun({ text, ...format }));
        }
      }
    }
  }
  return runs;
}

// A list item's own tokens mix its inline content with any nested `list`
// token in document order — separated here rather than assumed sequential,
// so the item's own line always renders before its sub-list regardless of
// how marked orders loose-list wrapper tokens.
function buildListItemParagraphs(
  item: Tokens.ListItem,
  ordered: boolean,
  level: number,
): Paragraph[] {
  const reference = ordered
    ? DOCX_NUMBERING_REFERENCES.numbered
    : DOCX_NUMBERING_REFERENCES.bullet;
  const numberingLevel = Math.min(level, 2);

  const ownInlineTokens: Token[] = [];
  const nestedLists: Tokens.List[] = [];

  for (const token of item.tokens as readonly MarkedToken[]) {
    if (token.type === "list") {
      nestedLists.push(token);
    } else if (
      (token.type === "text" || token.type === "paragraph") &&
      token.tokens
    ) {
      ownInlineTokens.push(...token.tokens);
    } else {
      ownInlineTokens.push(token);
    }
  }

  const paragraphs: Paragraph[] = [
    new Paragraph({
      style: "ListParagraph",
      numbering: { reference, level: numberingLevel },
      children: buildInlineRuns(ownInlineTokens),
    }),
  ];

  for (const nestedList of nestedLists) {
    for (const nestedItem of nestedList.items) {
      paragraphs.push(
        ...buildListItemParagraphs(nestedItem, nestedList.ordered, level + 1),
      );
    }
  }

  return paragraphs;
}

function mapCellAlignment(
  align: Tokens.TableCell["align"],
): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
  if (align === "center") return AlignmentType.CENTER;
  if (align === "right") return AlignmentType.RIGHT;
  if (align === "left") return AlignmentType.LEFT;
  return undefined;
}

function buildTable(token: Tokens.Table): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: token.header.map(
      (cell) =>
        new TableCell({
          shading: DOCX_TABLE_HEADER_SHADING,
          children: [
            new Paragraph({
              alignment: mapCellAlignment(cell.align),
              children: buildInlineRuns(cell.tokens, { bold: true }),
            }),
          ],
        }),
    ),
  });

  const dataRows = token.rows.map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              children: [
                new Paragraph({
                  alignment: mapCellAlignment(cell.align),
                  children: buildInlineRuns(cell.tokens),
                }),
              ],
            }),
        ),
      }),
  );

  // Single shared border/shading preset (../exporters/docx-styles.ts) — the
  // one call site every table goes through, so table appearance still has
  // exactly one place to change even without a genuine reusable OOXML
  // table style (docx.js v9 has no ergonomic API to author one; see the
  // constant's own comment).
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: DOCX_TABLE_BORDERS,
    rows: [headerRow, ...dataRows],
  });
}

function buildBlockquoteParagraphs(
  token: Tokens.Blockquote,
): (Paragraph | Table)[] {
  const paragraphs: (Paragraph | Table)[] = [];
  for (const inner of token.tokens as readonly MarkedToken[]) {
    if (inner.type === "paragraph" || inner.type === "text") {
      paragraphs.push(
        new Paragraph({
          style: DOCX_PARAGRAPH_STYLE_IDS.blockquote,
          children: buildInlineRuns(inner.tokens ?? [inner]),
        }),
      );
    } else {
      // Nested lists/tables inside a blockquote are rare in these
      // artefact templates; fall back to the plain block renderer rather
      // than drop the content.
      paragraphs.push(...buildBlocks([inner]));
    }
  }
  return paragraphs;
}

function buildBlocks(tokens: readonly Token[]): (Paragraph | Table)[] {
  const blocks: (Paragraph | Table)[] = [];
  for (const token of tokens as readonly MarkedToken[]) {
    switch (token.type) {
      case "heading": {
        const level = Math.min(Math.max(token.depth, 1), 6);
        blocks.push(
          new Paragraph({
            heading: HEADING_LEVELS[level],
            children: buildInlineRuns(token.tokens),
          }),
        );
        break;
      }
      case "paragraph":
        blocks.push(new Paragraph({ children: buildInlineRuns(token.tokens) }));
        break;
      case "list":
        for (const item of token.items) {
          blocks.push(...buildListItemParagraphs(item, token.ordered, 0));
        }
        break;
      case "table":
        blocks.push(buildTable(token));
        break;
      case "blockquote":
        blocks.push(...buildBlockquoteParagraphs(token));
        break;
      case "code": {
        const lines = token.text.split("\n");
        const children: ParagraphChild[] = lines.flatMap((line, index) => [
          new TextRun({ text: line, break: index === 0 ? undefined : 1 }),
        ]);
        blocks.push(
          new Paragraph({
            style: DOCX_PARAGRAPH_STYLE_IDS.codeBlock,
            children,
          }),
        );
        break;
      }
      case "hr":
        blocks.push(new Paragraph({ text: "" }));
        break;
      case "space":
        // Blank-line token — paragraph spacing already carries vertical rhythm.
        break;
      default:
        // Raw HTML / link-reference definitions — not emitted by these
        // artefact templates; skip rather than guess a rendering.
        break;
    }
  }
  return blocks;
}

async function exportMarkdownToDocx(
  markdown: string,
  provenance: Provenance,
): Promise<Buffer> {
  const tokens = marked.lexer(markdown, { gfm: true, breaks: false });
  const children = buildBlocks(tokens);

  const document = new Document({
    creator: "AI Catalyst",
    description: `Exported from ${provenance.sourceArtifactId} v${provenance.sourceArtifactVersion}`,
    styles: DOCX_STYLES,
    numbering: DOCX_NUMBERING,
    customProperties: [
      { name: "SourceArtifactId", value: provenance.sourceArtifactId },
      {
        name: "SourceArtifactVersion",
        value: String(provenance.sourceArtifactVersion),
      },
      { name: "SourceContentHash", value: provenance.sourceContentHash },
      { name: "ExporterKey", value: provenance.rendererKey },
      { name: "ExporterVersion", value: provenance.rendererVersion },
      { name: "GeneratedAt", value: provenance.generatedAt },
      { name: "WorkspaceId", value: provenance.workspaceId },
      { name: "ProgramRunId", value: provenance.programRunId },
      {
        name: "ProgramVersionNumber",
        value: String(provenance.programVersionNumber),
      },
    ],
    sections: [
      {
        properties: DOCX_SECTION_PROPERTIES,
        children:
          children.length > 0 ? children : [new Paragraph({ text: "" })],
      },
    ],
  });

  return Packer.toBuffer(document);
}

export const markdownDocxV1: DocumentExporter = {
  format: "docx",
  exporterVersion: "1",
  mimeType:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  extension: "docx",
  async export(markdown, provenance) {
    return exportMarkdownToDocx(markdown, provenance);
  },
};
