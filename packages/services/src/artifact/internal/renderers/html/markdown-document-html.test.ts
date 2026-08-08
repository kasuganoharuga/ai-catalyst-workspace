import { describe, expect, it } from "vitest";

import { buildMarkdownDocumentHtml } from "./markdown-document-html.js";

describe("buildMarkdownDocumentHtml", () => {
  it("renders Markdown structure to HTML elements, not escaped source", () => {
    const html = buildMarkdownDocumentHtml({
      title: "Ideal Customer Avatar",
      footerLabel: "AI Catalyst · Ideal Customer Avatar",
      markdown: `# Ideal Customer Avatar

## Snapshot

**Beachhead:** Ops managers at mid-market logistics firms.

| Field | Value |
| --- | --- |
| Role | Operations Manager |

- Cares about handoffs
- Avoids spreadsheet chaos
`,
    });

    expect(html).toContain("<h1>Ideal Customer Avatar</h1>");
    expect(html).toContain("<h2>Snapshot</h2>");
    expect(html).toContain("<strong>Beachhead:</strong>");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Field</th>");
    expect(html).toContain("<li>Cares about handoffs</li>");
    expect(html).not.toContain('<pre class="table">');
    expect(html).not.toContain("## Snapshot");
    expect(html).toContain("AI Catalyst · Ideal Customer Avatar");
  });
});
