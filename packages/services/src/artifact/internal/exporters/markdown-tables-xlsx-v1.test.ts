import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { artifactMarkdownHasTables } from "../markdown-sections.js";
import { markdownTablesXlsxV1 } from "./markdown-tables-xlsx-v1.js";
import type { Provenance } from "./types.js";

const PROVENANCE: Provenance = {
  sourceArtifactId: "validation_roadmap_30_day",
  sourceArtifactVersion: 2,
  sourceContentHash: "def456",
  rendererKey: "markdown_xlsx_v1",
  rendererVersion: "1",
  generatedAt: "2026-08-21T00:00:00.000Z",
  workspaceId: "11111111-1111-1111-1111-111111111111",
  programRunId: "22222222-2222-2222-2222-222222222222",
  programVersionNumber: 2,
};

const MARKDOWN_WITH_TWO_TABLES = [
  "# 30-Day Validation Roadmap",
  "",
  "## Experiment 1",
  "",
  "| Claim | Window |",
  "| --- | --- |",
  "| Founders will pay $50/mo | Days 1-10 |",
  "",
  "## Experiment 2",
  "",
  "| Claim | Window |",
  "| --- | --- |",
  "| Referral loop drives signups | Days 11-20 |",
].join("\n");

const MARKDOWN_WITH_NO_TABLES = [
  "# Problem Statement",
  "",
  "Just prose, no tables anywhere in this document.",
].join("\n");

// `xl/worksheets/_rels/sheetN.xml.rels` also starts with this prefix —
// matched separately so it never gets counted as a worksheet.
const WORKSHEET_FILE_PATTERN = /^xl\/worksheets\/sheet\d+\.xml$/;

async function listSheetFiles(buffer: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer);
  return Object.keys(zip.files).filter((name) =>
    WORKSHEET_FILE_PATTERN.test(name),
  );
}

// Every table sheet after the always-first "Source" sheet, concatenated —
// callers checking one specific table's rows should still exclude Source's
// own rows explicitly if they care about an exact row count.
async function readTableSheetsXml(buffer: Buffer): Promise<string> {
  const files = (await listSheetFiles(buffer)).sort();
  const zip = await JSZip.loadAsync(buffer);
  const contents = await Promise.all(
    files.slice(1).map((name) => zip.file(name)!.async("text")),
  );
  return contents.join("\n");
}

async function readWorkbookXml(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file("xl/workbook.xml");
  if (!file) throw new Error("xl/workbook.xml missing");
  return file.async("text");
}

async function readSharedStrings(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file("xl/sharedStrings.xml");
  return file ? file.async("text") : "";
}

describe("artifactMarkdownHasTables", () => {
  it("is true when the document has at least one GFM table", () => {
    expect(artifactMarkdownHasTables(MARKDOWN_WITH_TWO_TABLES)).toBe(true);
  });

  it("is false when the document has no table", () => {
    expect(artifactMarkdownHasTables(MARKDOWN_WITH_NO_TABLES)).toBe(false);
  });
});

describe("markdownTablesXlsxV1", () => {
  it("returns null (never an empty workbook) when there are no tables", async () => {
    const buffer = await markdownTablesXlsxV1.export(
      MARKDOWN_WITH_NO_TABLES,
      PROVENANCE,
    );
    expect(buffer).toBeNull();
  });

  it("produces one sheet per table plus the Source sheet, and preserves every cell", async () => {
    const buffer = (await markdownTablesXlsxV1.export(
      MARKDOWN_WITH_TWO_TABLES,
      PROVENANCE,
    )) as Buffer;
    expect(buffer).not.toBeNull();

    const sheetFiles = await listSheetFiles(buffer);
    // Source + Experiment 1 + Experiment 2.
    expect(sheetFiles).toHaveLength(3);

    const sharedStrings = await readSharedStrings(buffer);
    for (const expected of [
      "Claim",
      "Window",
      "Founders will pay $50/mo",
      "Days 1-10",
      "Referral loop drives signups",
      "Days 11-20",
    ]) {
      expect(sharedStrings).toContain(expected);
    }
  });

  it("names sheets after their heading and deduplicates when headings repeat", async () => {
    const duplicateHeadingMarkdown = [
      "## Round",
      "| A |",
      "| - |",
      "| 1 |",
      "## Round",
      "| B |",
      "| - |",
      "| 2 |",
    ].join("\n");

    const buffer = (await markdownTablesXlsxV1.export(
      duplicateHeadingMarkdown,
      PROVENANCE,
    )) as Buffer;
    const workbookXml = await readWorkbookXml(buffer);
    expect(workbookXml).toContain('name="Round"');
    expect(workbookXml).toContain('name="Round (2)"');
  });

  it("stamps provenance into a visible Source sheet", async () => {
    const buffer = (await markdownTablesXlsxV1.export(
      MARKDOWN_WITH_TWO_TABLES,
      PROVENANCE,
    )) as Buffer;
    const workbookXml = await readWorkbookXml(buffer);
    expect(workbookXml).toContain('name="Source"');

    const sharedStrings = await readSharedStrings(buffer);
    expect(sharedStrings).toContain(PROVENANCE.sourceArtifactId);
    expect(sharedStrings).toContain(PROVENANCE.sourceContentHash);
  });

  it("preserves blank scaffold rows and strips ** markers from cell text", async () => {
    const markdownWithBoldAndBlank = [
      "## Roster",
      "| Name | Role |",
      "| - | - |",
      "| **Alice** | Lead |",
      "|  |  |",
    ].join("\n");

    const buffer = (await markdownTablesXlsxV1.export(
      markdownWithBoldAndBlank,
      PROVENANCE,
    )) as Buffer;
    const sheetXml = await readTableSheetsXml(buffer);
    const sharedStrings = await readSharedStrings(buffer);

    expect(sharedStrings).toContain("Alice");
    expect(sharedStrings).not.toContain("**Alice**");
    // Header row + Alice row + one blank scaffold row = 3 rows.
    expect(sheetXml.match(/<row /g)?.length).toBe(3);
  });
});
