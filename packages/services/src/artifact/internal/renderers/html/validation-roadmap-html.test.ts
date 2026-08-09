import { describe, expect, it } from "vitest";

import { buildValidationRoadmapHtml } from "./validation-roadmap-html.js";

function fixture(): string {
  return `# 30-Day Validation Roadmap

## Venture
- Venture name: Kerbside

## Constraints

**Time available:** 6 hours a week

**Budget:** $500

**Customer access:** 12 warm introductions from the Melbourne depot network

## What These Experiments Test

Whether operations leads will take a concrete step toward solving reconciliation, not just talk about it.

## Experiments

| Experiment | Claim tested | Pass condition | Fail condition | Time | Cost | Expected evidence signal strength (1–5) | 30-day window |
|---|---|---|---|---|---|---|---|
| Concierge pilot | Leads will hand over a real run sheet for manual reconciliation | 3 of 8 leads send a run sheet within 48 hours | Fewer than 2 of 8 respond within a week | 4 hours/week | $0 | 4 | Week 1 |
| Paid waitlist | Leads will pay a deposit to reserve a pilot slot | 2 of 8 leads pay a $50 deposit | Zero leads pay within 2 weeks | 2 hours/week | $50 | 5 | Week 2–3 |

### Expected evidence signal strength

- **1** — produces only general information or weak indirect evidence
- **2** — clarifies an assumption but cannot establish customer behaviour
- **3** — can produce direct primary evidence from matching customers
- **4** — can produce an observable behavioural or commercial demand signal
- **5** — can produce a binding commercial commitment or payment

## Start Here

**What to do:** Send the concierge pilot offer to all 8 warm introductions this week.

**Who to contact, and how:** The 8 Melbourne depot contacts, by direct message.

**What counts as a pass:** 3 of 8 leads send a run sheet within 48 hours

**What counts as a fail:** Fewer than 2 of 8 respond within a week

## How to Record Results

Results are not recorded in this roadmap. Keep the results with you and bring them into the review
that follows.
`;
}

describe("buildValidationRoadmapHtml", () => {
  const html = buildValidationRoadmapHtml({
    title: "30-Day Validation Roadmap",
    footerLabel: "AI Catalyst · 30-Day Validation Roadmap",
    markdown: fixture(),
  });

  it("renders stacked experiment cards instead of the wide Experiments table", () => {
    expect(html).toContain('class="experiment-card"');
    expect(html).toContain("Experiment 1 — Concierge pilot");
    expect(html).toContain("Experiment 2 — Paid waitlist");
    expect(html).toContain("<dt>Claim tested</dt>");
    expect(html).toContain("<dt>Pass condition</dt>");
    expect(html).toContain("<dt>30-day window</dt>");
    // Source Markdown keeps the 8-column table; printable HTML must not.
    expect(html).not.toContain("<th>Experiment</th>");
    expect(html).not.toContain("Expected evidence signal strength (1–5)");
  });

  it("keeps the fixed print footer chrome", () => {
    expect(html).toContain('class="print-footer"');
    expect(html).toContain("AI Catalyst · 30-Day Validation Roadmap");
    expect(html).not.toMatch(/<footer>/);
  });

  it("still includes the surrounding roadmap sections", () => {
    expect(html).toContain("<h2>Venture</h2>");
    expect(html).toContain("Kerbside");
    expect(html).toContain("<h2>Start Here</h2>");
    expect(html).toContain("<h2>How to Record Results</h2>");
  });
});
