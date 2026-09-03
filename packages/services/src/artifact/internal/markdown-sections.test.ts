import { describe, expect, it } from "vitest";

import {
  artifactMarkdownHasTables,
  listHeadings,
  parseAllTables,
  parseTable,
} from "./markdown-sections.js";

describe("listHeadings", () => {
  it("returns every heading in document order with level and line index", () => {
    const content = [
      "# Title",
      "",
      "## Section One",
      "body",
      "### Sub",
      "more",
      "## Section Two",
    ].join("\n");

    expect(listHeadings(content)).toEqual([
      { level: 1, heading: "Title", lineIndex: 0 },
      { level: 2, heading: "Section One", lineIndex: 2 },
      { level: 3, heading: "Sub", lineIndex: 4 },
      { level: 2, heading: "Section Two", lineIndex: 6 },
    ]);
  });

  it("returns an empty array for content with no headings", () => {
    expect(listHeadings("just prose\nmore prose")).toEqual([]);
  });
});

describe("parseAllTables", () => {
  it("pairs each table with the heading whose section it falls under", () => {
    const content = [
      "## First Table",
      "| A | B |",
      "| - | - |",
      "| 1 | 2 |",
      "",
      "## Second Table",
      "| X | Y |",
      "| - | - |",
      "| 3 | 4 |",
    ].join("\n");

    const result = parseAllTables(content);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      heading: "First Table",
      headingLevel: 2,
      table: { headers: ["A", "B"], rows: [["1", "2"]] },
    });
    expect(result[1]).toEqual({
      heading: "Second Table",
      headingLevel: 2,
      table: { headers: ["X", "Y"], rows: [["3", "4"]] },
    });
  });

  it("correctly scopes tables under two headings that share the same text (unlike getSection's first-match lookup)", () => {
    const content = [
      "## Repeated",
      "| A |",
      "| - |",
      "| 1 |",
      "## Repeated",
      "| B |",
      "| - |",
      "| 2 |",
    ].join("\n");

    const result = parseAllTables(content);

    expect(result).toHaveLength(2);
    expect(result[0].table).toEqual({ headers: ["A"], rows: [["1"]] });
    expect(result[1].table).toEqual({ headers: ["B"], rows: [["2"]] });
  });

  it("uses heading = null for a table appearing before any heading", () => {
    const content = ["| A |", "| - |", "| 1 |", "", "## Later"].join("\n");

    const result = parseAllTables(content);

    expect(result).toHaveLength(1);
    expect(result[0].heading).toBeNull();
    expect(result[0].headingLevel).toBeNull();
  });

  it("returns an empty array when the document has no tables", () => {
    expect(parseAllTables("## Heading\n\nJust prose, no table.")).toEqual([]);
  });

  it("preserves blank scaffold rows and ** emphasis markers verbatim, unlike parseTable", () => {
    const content = [
      "## Roster",
      "| Name | Role |",
      "| - | - |",
      "| **Alice** | Lead |",
      "|  |  |",
    ].join("\n");

    const raw = parseAllTables(content)[0].table;
    expect(raw.rows).toEqual([
      ["**Alice**", "Lead"],
      ["", ""],
    ]);

    // parseTable (validator path) strips emphasis and drops the blank row —
    // confirms this change did not alter its existing behaviour.
    const filtered = parseTable(
      ["| Name | Role |", "| - | - |", "| **Alice** | Lead |", "|  |  |"].join(
        "\n",
      ),
    );
    expect(filtered?.rows).toEqual([["Alice", "Lead"]]);
  });
});

describe("artifactMarkdownHasTables", () => {
  it("is true when the document has at least one GFM table", () => {
    const content = ["## Section", "| A |", "| - |", "| 1 |"].join("\n");
    expect(artifactMarkdownHasTables(content)).toBe(true);
  });

  it("is false when the document has no table", () => {
    expect(artifactMarkdownHasTables("## Section\n\nJust prose.")).toBe(false);
  });
});
