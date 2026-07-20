import { describe, expect, it } from "vitest";

import { parseTemplateOutline } from "./template-outline.js";

describe("parseTemplateOutline", () => {
  it("returns an empty list when there is no template", () => {
    expect(parseTemplateOutline(null)).toEqual([]);
    expect(parseTemplateOutline("")).toEqual([]);
  });

  it("keeps only H2 section headings", () => {
    expect(
      parseTemplateOutline(`# Founder Toolkit Setup Summary

## Founder Context
- Workspace:
- Venture:

## Connection
- AI client:

## Notes
- None
`),
    ).toEqual([
      { heading: "Founder Context", items: [] },
      { heading: "Connection", items: [] },
      { heading: "Notes", items: [] },
    ]);
  });

  it("ignores H3 subsections", () => {
    expect(
      parseTemplateOutline(`# Pressure-Test Verdict

## Confirmed Q&A

### 1. Idea in one sentence

## Founder's Decision

### Initial decision
`),
    ).toEqual([
      { heading: "Confirmed Q&A", items: [] },
      { heading: "Founder's Decision", items: [] },
    ]);
  });
});
