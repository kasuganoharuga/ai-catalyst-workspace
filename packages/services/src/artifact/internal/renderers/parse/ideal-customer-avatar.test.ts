import { describe, expect, it } from "vitest";

import { parseIdealCustomerAvatar } from "./ideal-customer-avatar.js";

// Mirrors the real structure from
// content-seed/content/module-2.ts's IDEAL_CUSTOMER_AVATAR_TEMPLATE, filled
// in as a Founder's confirmed submission would be.
function fixture(): string {
  return `# Ideal Customer Avatar

## Venture
- Venture name: Kerbside

## Segment

Australian pre-seed / seed founders raising $500k–$3M.

## Snapshot

**WHO:** 32–42, technical or domain-expert founder; 2–8 person team.

**WHERE:** Sydney / Melbourne / Brisbane. Often accelerator-adjacent.

**STAGE:** Post-MVP, $10k–$80k ARR or strong pilots. 6–12 months runway.

**CURRENT COMMERCIAL MOMENT:** First institutional round. SAFE, note or priced seed.

## Situation

Has proven the product works and now needs capital to hire and scale, but the raise itself is a black box.

## Unmet Needs

### Functional — what they need done

1. Close the round in a defined window, not an open-ended drift that burns runway.
2. Avoid mistakes that cost them control — stacked SAFEs, uncapped notes, over-dilution.
3. Know who to actually talk to — a qualified list of angels and funds in their sector.

### Emotional and social — what they feel

1. Stop feeling like an outsider in a game nobody has explained.
2. Certainty over vibes — wants a checklist and a system.
3. Protect their credibility with their best investor relationships.

## Buying Signals

### Tier 1 — high intent, act within 24–48 hours

- Searches "how to raise a seed round" or "SAFE vs convertible note".
- Downloads a capital-raising guide or white paper.
- Grabs a term sheet template or cap table model.

### Tier 2 — building intent, nurture over 4–12 weeks

- Trigger events: first paying customers, first sales hire, went full-time.
- Accepted into or just graduated an accelerator.
- Signed up to cap table tooling; follows VC partners.

## Disqualifiers

- Wants a broker to raise it for them.
- Already has a signed term sheet.
- Idea stage, pre-MVP.

## Core Promise

Run a professional seed raise in a defined window, keep control of your company, and own the process for next time.

## Validation Status

This section records the evidence available when this version of the Avatar was created.

**Current level:** Interviewed

### Based on observation

Three founders interviewed matched this profile closely.

### Founder assumptions

Raise timeline assumption not yet tested against a live process.

### Important unknowns

Whether Tier 1 signals convert at the rate assumed.

### Contradicting evidence

None recorded yet.

### Highest-priority validation questions

Does the accelerator-adjacent channel actually produce warm introductions?
`;
}

describe("parseIdealCustomerAvatar — happy path", () => {
  const model = parseIdealCustomerAvatar(fixture());

  it("extracts the venture name and segment", () => {
    expect(model.ventureName).toBe("Kerbside");
    expect(model.segment).toContain("Australian pre-seed");
  });

  it("extracts all four snapshot fields", () => {
    expect(model.snapshot.who).toContain("technical or domain-expert founder");
    expect(model.snapshot.where).toContain("Sydney");
    expect(model.snapshot.stage).toContain("Post-MVP");
    expect(model.snapshot.raise).toContain("First institutional round");
  });

  it("accepts the legacy RAISE / CURRENT COMMERCIAL MOMENT Snapshot label", () => {
    const legacy = fixture().replace(
      "**CURRENT COMMERCIAL MOMENT:**",
      "**RAISE / CURRENT COMMERCIAL MOMENT:**",
    );
    const legacyModel = parseIdealCustomerAvatar(legacy);
    expect(legacyModel.snapshot.raise).toContain("First institutional round");
  });

  it("extracts the Situation paragraph", () => {
    expect(model.situation).toContain("black box");
  });

  it("extracts 3 functional and 3 emotional unmet needs", () => {
    expect(model.unmetNeeds.functional).toHaveLength(3);
    expect(model.unmetNeeds.emotional).toHaveLength(3);
    expect(model.unmetNeeds.functional[0]).toContain("Close the round");
  });

  it("extracts 3 Tier 1 and 3 Tier 2 buying signals", () => {
    expect(model.buyingSignals.tier1).toHaveLength(3);
    expect(model.buyingSignals.tier2).toHaveLength(3);
  });

  it("extracts 3 disqualifiers and the core promise", () => {
    expect(model.disqualifiers).toHaveLength(3);
    expect(model.corePromise).toContain("Run a professional seed raise");
  });

  it("strips markdown emphasis from extracted text", () => {
    expect(model.snapshot.who).not.toMatch(/\*\*/);
  });

  it("extracts the internal Validation Status fields", () => {
    expect(model.validationStatus.currentLevel).toBe("Interviewed");
    expect(model.validationStatus.basedOnObservation).toContain(
      "Three founders interviewed",
    );
    expect(model.validationStatus.founderAssumptions).toContain(
      "Raise timeline assumption",
    );
    expect(model.validationStatus.importantUnknowns).toContain(
      "Tier 1 signals convert",
    );
    expect(model.validationStatus.contradictingEvidence).toBe(
      "None recorded yet.",
    );
    expect(model.validationStatus.highestPriorityQuestions).toContain(
      "accelerator-adjacent channel",
    );
  });
});

describe("parseIdealCustomerAvatar — orRecordedUnknown escape", () => {
  it("accepts a single 'not yet known' sentence instead of 3+ items", () => {
    const withUnknown = fixture().replace(
      /### Emotional and social — what they feel\n\n1\. Stop feeling like an outsider in a game nobody has explained\.\n2\. Certainty over vibes — wants a checklist and a system\.\n3\. Protect their credibility with their best investor relationships\.\n/,
      "### Emotional and social — what they feel\n\nNot yet known — no interviews run on this axis.\n",
    );
    const model = parseIdealCustomerAvatar(withUnknown);
    expect(model.unmetNeeds.emotional).toEqual([
      "Not yet known — no interviews run on this axis.",
    ]);
  });

  it("rejects prose that doesn't name the gap explicitly (not a recognised unknown phrasing)", () => {
    const bad = fixture().replace(
      /### Emotional and social — what they feel\n\n1\. Stop feeling like an outsider in a game nobody has explained\.\n2\. Certainty over vibes — wants a checklist and a system\.\n3\. Protect their credibility with their best investor relationships\.\n/,
      "### Emotional and social — what they feel\n\nThey probably feel some things about this.\n",
    );
    expect(() => parseIdealCustomerAvatar(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Emotional/,
    );
  });
});

describe("parseIdealCustomerAvatar — negative cases (each must throw WORKBOOK_RENDER_FAILED)", () => {
  it("throws when Venture name is blank", () => {
    const bad = fixture().replace(
      "- Venture name: Kerbside",
      "- Venture name:",
    );
    expect(() => parseIdealCustomerAvatar(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Venture name/,
    );
  });

  it("throws when Segment is empty", () => {
    const bad = fixture().replace(
      "Australian pre-seed / seed founders raising $500k–$3M.",
      "",
    );
    expect(() => parseIdealCustomerAvatar(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Segment/,
    );
  });

  it("throws when Snapshot is missing the CURRENT COMMERCIAL MOMENT label", () => {
    const bad = fixture().replace(
      "**CURRENT COMMERCIAL MOMENT:** First institutional round. SAFE, note or priced seed.\n",
      "",
    );
    expect(() => parseIdealCustomerAvatar(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*CURRENT COMMERCIAL MOMENT/,
    );
  });

  it("throws when there are only 2 functional unmet needs", () => {
    const bad = fixture().replace(
      "3. Know who to actually talk to — a qualified list of angels and funds in their sector.\n",
      "",
    );
    expect(() => parseIdealCustomerAvatar(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Functional/,
    );
  });

  it("throws when there are only 2 disqualifiers", () => {
    const bad = fixture().replace("- Idea stage, pre-MVP.\n", "");
    expect(() => parseIdealCustomerAvatar(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Disqualifiers/,
    );
  });

  it("throws when Core Promise is missing entirely", () => {
    const bad = fixture().replace(
      /## Core Promise\n\nRun a professional seed raise in a defined window, keep control of your company, and own the process for next time\.\n\n/,
      "",
    );
    expect(() => parseIdealCustomerAvatar(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Core Promise/,
    );
  });

  it("throws when Contradicting evidence is empty", () => {
    const bad = fixture().replace(
      "### Contradicting evidence\n\nNone recorded yet.\n",
      "### Contradicting evidence\n\n",
    );
    expect(() => parseIdealCustomerAvatar(bad)).toThrow(
      /WORKBOOK_RENDER_FAILED.*Contradicting evidence/,
    );
  });
});
