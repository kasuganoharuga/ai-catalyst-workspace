// markdown tables → .xlsx — generic format conversion (see ./types.ts), not
// a per-artefact renderer. One sheet per GFM table in the document, using
// parseAllTables (../markdown-sections.ts) — the export-fidelity counterpart
// to parseTable's validator-signal extraction: every row verbatim, no
// blank-row filtering. parseAllTables also leaves `**bold**` markers intact;
// we strip them only here, at the cell-rendering step, because Excel has no
// bold-span-within-a-string concept — the emphasis becomes plain text, never
// literal `**`.

import writeExcelFile, { type Sheet } from "write-excel-file/node";

import {
  parseAllTables,
  stripMarkdownEmphasis,
} from "@ai-catalyst/services/artifact/internal/markdown-sections";
import { DOCX_FONTS } from "@ai-catalyst/services/artifact/internal/exporters/docx-styles";
import type {
  DocumentExporter,
  Provenance,
} from "@ai-catalyst/services/artifact/internal/exporters/types";

const MAX_SHEET_NAME_LENGTH = 31;
// Characters Excel forbids in a sheet name: \ / ? * [ ] and the colon.
const INVALID_SHEET_NAME_CHARS = /[\\/?*[\]:]/g;

function sanitizeSheetName(
  rawName: string,
  index: number,
  used: Set<string>,
): string {
  const cleaned = rawName
    .replace(INVALID_SHEET_NAME_CHARS, " ")
    .trim()
    .slice(0, MAX_SHEET_NAME_LENGTH);
  const base = cleaned.length > 0 ? cleaned : `Table ${index + 1}`;

  let candidate = base;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffixText = ` (${suffix})`;
    candidate = `${base.slice(0, MAX_SHEET_NAME_LENGTH - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function buildTableSheet(
  heading: string | null,
  headers: string[],
  rows: string[][],
  sheetName: string,
): Sheet<Buffer> {
  const headerRow = headers.map((header) => ({
    value: stripMarkdownEmphasis(header),
    fontWeight: "bold" as const,
    backgroundColor: "#F2F2F2",
    borderColor: "#CCCCCC",
    borderStyle: "thin" as const,
  }));

  const dataRows = rows.map((row) =>
    headers.map((_, columnIndex) => ({
      value: stripMarkdownEmphasis(row[columnIndex] ?? ""),
      borderColor: "#CCCCCC",
      borderStyle: "thin" as const,
      wrap: true,
    })),
  );

  return {
    sheet: sheetName,
    data: [headerRow, ...dataRows],
    stickyRowsCount: 1,
    columns: headers.map(() => ({ width: 28 })),
  };
}

async function exportMarkdownTablesToXlsx(
  markdown: string,
  provenance: Provenance,
): Promise<Buffer | null> {
  const tables = parseAllTables(markdown);
  if (tables.length === 0) {
    return null;
  }

  const usedNames = new Set<string>();
  const sheets = tables.map((section, index) =>
    buildTableSheet(
      section.heading,
      section.table.headers,
      section.table.rows,
      sanitizeSheetName(
        section.heading ?? `Table ${index + 1}`,
        index,
        usedNames,
      ),
    ),
  );

  // No first-class workbook-metadata API in write-excel-file (unlike docx's
  // coreProperties) — a leading "Source" sheet keeps provenance visible to
  // whoever opens the file instead, which a Founder or Mentor can actually
  // read, unlike buried XML metadata.
  const provenanceSheet: Sheet<Buffer> = {
    sheet: "Source",
    data: [
      [
        { value: "Field", fontWeight: "bold" as const },
        { value: "Value", fontWeight: "bold" as const },
      ],
      ["Source artifact", provenance.sourceArtifactId],
      ["Source version", String(provenance.sourceArtifactVersion)],
      ["Source SHA-256", provenance.sourceContentHash],
      ["Exporter", `${provenance.rendererKey} v${provenance.rendererVersion}`],
      ["Generated at", provenance.generatedAt],
    ],
    columns: [{ width: 18 }, { width: 60 }],
  };

  // writeExcelFile() itself returns synchronously — only .toBuffer() is async.
  const result = writeExcelFile([provenanceSheet, ...sheets], {
    fontFamily: DOCX_FONTS.sans,
    fontSize: 10,
  });
  return result.toBuffer();
}

export const markdownTablesXlsxV1: DocumentExporter = {
  format: "xlsx",
  exporterVersion: "1",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  extension: "xlsx",
  async export(markdown, provenance) {
    return exportMarkdownTablesToXlsx(markdown, provenance);
  },
};
