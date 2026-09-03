import { describe, expect, it } from "vitest";

import {
  parseDownloadFormat,
  parseSectionCount,
  safeFilename,
  withExtension,
} from "@/app/(app)/artefacts/lib/artefact-download";

describe("parseDownloadFormat", () => {
  it("defaults to source when the param is missing", () => {
    expect(parseDownloadFormat(null)).toBe("source");
  });

  it("accepts every recognised format", () => {
    for (const format of ["source", "workbook", "docx", "xlsx"]) {
      expect(parseDownloadFormat(format)).toBe(format);
    }
  });

  // Never falls back to Markdown on a bad value — a silent .md for someone
  // who asked for a workbook is worse than an error.
  it("rejects an unrecognised format rather than falling back to source", () => {
    expect(parseDownloadFormat("pdf")).toBeNull();
    expect(parseDownloadFormat("")).toBeNull();
  });
});

describe("parseSectionCount", () => {
  it("returns undefined when the param is omitted", () => {
    expect(parseSectionCount(null)).toBeUndefined();
  });

  it("accepts every integer 5 through 10", () => {
    for (let n = 5; n <= 10; n += 1) {
      expect(parseSectionCount(String(n))).toBe(n);
    }
  });

  it("rejects out-of-range and non-integer values", () => {
    expect(parseSectionCount("4")).toBeNull();
    expect(parseSectionCount("11")).toBeNull();
    expect(parseSectionCount("abc")).toBeNull();
    expect(parseSectionCount("7.5")).toBeNull();
  });
});

describe("safeFilename", () => {
  it("strips reserved filesystem characters", () => {
    expect(safeFilename('a\\b/c:d*e?f"g<h>i|j', "fallback")).toBe(
      "a_b_c_d_e_f_g_h_i_j",
    );
  });

  it("falls back when the name is empty after trimming", () => {
    expect(safeFilename("   ", "fallback.md")).toBe("fallback.md");
  });

  it("collapses a run of reserved characters to one underscore, not empty", () => {
    expect(safeFilename("///", "fallback.md")).toBe("_");
  });
});

describe("withExtension", () => {
  it("swaps a single existing extension", () => {
    expect(withExtension("Ideal-Customer-Avatar.md", "docx")).toBe(
      "Ideal-Customer-Avatar.docx",
    );
  });

  it("swaps only the last extension in a multi-dot name", () => {
    expect(withExtension("a.b.md", "docx")).toBe("a.b.docx");
  });

  it("appends an extension to a name with none", () => {
    expect(withExtension("artefact", "docx")).toBe("artefact.docx");
  });
});
