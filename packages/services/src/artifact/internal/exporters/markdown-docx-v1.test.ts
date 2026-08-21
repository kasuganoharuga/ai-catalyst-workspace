import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { markdownDocxV1 } from "./markdown-docx-v1.js";
import type { Provenance } from "./types.js";

const PROVENANCE: Provenance = {
  sourceArtifactId: "ideal_customer_avatar",
  sourceArtifactVersion: 3,
  sourceContentHash: "abc123",
  rendererKey: "markdown_docx_v1",
  rendererVersion: "1",
  generatedAt: "2026-08-21T00:00:00.000Z",
  workspaceId: "11111111-1111-1111-1111-111111111111",
  programRunId: "22222222-2222-2222-2222-222222222222",
  programVersionNumber: 2,
};

const SAMPLE_MARKDOWN = [
  "# Ideal Customer Avatar",
  "",
  "## Who they are",
  "",
  "**Ops leads** at mid-size logistics companies.",
  "",
  "- First bullet point",
  "- Second bullet point with *emphasis*",
  "",
  "1. First numbered step",
  "2. Second numbered step",
  "",
  "> A verbatim customer quote goes here.",
  "",
  "## Evidence table",
  "",
  "| Signal | Strength |",
  "| --- | --- |",
  "| Repeated complaint | Strong |",
  "| Single anecdote | Weak |",
].join("\n");

async function readDocumentXml(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file("word/document.xml");
  if (!file) {
    throw new Error("word/document.xml missing from generated .docx");
  }
  return file.async("text");
}

async function readCustomPropertiesXml(buffer: Buffer): Promise<string | null> {
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file("docProps/custom.xml");
  return file ? file.async("text") : null;
}

describe("markdownDocxV1", () => {
  it("produces a valid zip with word/document.xml", async () => {
    const buffer = await markdownDocxV1.export(SAMPLE_MARKDOWN, PROVENANCE);
    expect(buffer).not.toBeNull();
    const zip = await JSZip.loadAsync(buffer as Buffer);
    expect(zip.file("[Content_Types].xml")).not.toBeNull();
    expect(zip.file("word/document.xml")).not.toBeNull();
  });

  it("includes every heading and paragraph text", async () => {
    const buffer = (await markdownDocxV1.export(
      SAMPLE_MARKDOWN,
      PROVENANCE,
    )) as Buffer;
    const xml = await readDocumentXml(buffer);
    expect(xml).toContain("Ideal Customer Avatar");
    expect(xml).toContain("Who they are");
    expect(xml).toContain("Ops leads");
    expect(xml).toContain("Evidence table");
  });

  it("renders list items with real numbering (w:numPr), not a literal bullet character", async () => {
    const buffer = (await markdownDocxV1.export(
      SAMPLE_MARKDOWN,
      PROVENANCE,
    )) as Buffer;
    const xml = await readDocumentXml(buffer);
    expect(xml).toContain("First bullet point");
    expect(xml).toContain("First numbered step");
    // Real numbering, not a hand-typed "• " — every list paragraph carries numPr.
    expect(xml).toContain("<w:numPr>");
    expect(xml).not.toMatch(/>\s*•\s*First bullet point/);
  });

  it("carries every table row and cell", async () => {
    const buffer = (await markdownDocxV1.export(
      SAMPLE_MARKDOWN,
      PROVENANCE,
    )) as Buffer;
    const xml = await readDocumentXml(buffer);
    expect(xml).toContain("Signal");
    expect(xml).toContain("Strength");
    expect(xml).toContain("Repeated complaint");
    expect(xml).toContain("Single anecdote");
    // Header + 2 data rows.
    expect(xml.match(/<w:tr[ >]/g)?.length).toBe(3);
  });

  it("renders the blockquote text", async () => {
    const buffer = (await markdownDocxV1.export(
      SAMPLE_MARKDOWN,
      PROVENANCE,
    )) as Buffer;
    const xml = await readDocumentXml(buffer);
    expect(xml).toContain("A verbatim customer quote goes here.");
  });

  it("stamps every provenance field into the document's custom properties", async () => {
    const buffer = (await markdownDocxV1.export(
      SAMPLE_MARKDOWN,
      PROVENANCE,
    )) as Buffer;
    const xml = await readCustomPropertiesXml(buffer);
    expect(xml).not.toBeNull();
    expect(xml).toContain(PROVENANCE.sourceArtifactId);
    expect(xml).toContain(String(PROVENANCE.sourceArtifactVersion));
    expect(xml).toContain(PROVENANCE.sourceContentHash);
    expect(xml).toContain(PROVENANCE.workspaceId);
    expect(xml).toContain(PROVENANCE.programRunId);
    expect(xml).toContain(String(PROVENANCE.programVersionNumber));
  });

  it("never produces an empty document for empty input", async () => {
    const buffer = (await markdownDocxV1.export("", PROVENANCE)) as Buffer;
    const zip = await JSZip.loadAsync(buffer);
    expect(zip.file("word/document.xml")).not.toBeNull();
  });
});
