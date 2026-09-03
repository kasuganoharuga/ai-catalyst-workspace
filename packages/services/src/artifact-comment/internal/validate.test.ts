import { describe, expect, it } from "vitest";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import {
  assertValidAnchor,
  assertValidBody,
  authorRoleForActor,
} from "./validate.js";

function actor(role: ActorContext["role"]): ActorContext {
  return { userId: "u1", role, source: "web" };
}

describe("assertValidBody", () => {
  it("rejects an empty body", () => {
    expect(() => assertValidBody("   ")).toThrow(/cannot be empty/);
  });

  it("trims and returns a valid body", () => {
    expect(assertValidBody("  hello  ")).toBe("hello");
  });

  it("rejects a body over 4000 characters", () => {
    expect(() => assertValidBody("a".repeat(4001))).toThrow(
      /cannot exceed 4000 characters/,
    );
  });

  it("accepts a body at exactly 4000 characters", () => {
    const body = "a".repeat(4000);
    expect(assertValidBody(body)).toBe(body);
  });
});

describe("assertValidAnchor", () => {
  const markdown = ["# Title", "", "## Evidence", "", "Body text."].join("\n");

  it("accepts a document anchor with no heading", () => {
    expect(assertValidAnchor({ kind: "document" }, markdown)).toEqual({
      heading: null,
      headingLevel: null,
    });
  });

  it("rejects a document anchor that carries a heading", () => {
    expect(() =>
      assertValidAnchor(
        { kind: "document", heading: "Evidence", headingLevel: 2 },
        markdown,
      ),
    ).toThrow(/cannot carry a heading/);
  });

  it("rejects a section anchor missing heading or headingLevel", () => {
    expect(() =>
      assertValidAnchor({ kind: "section", heading: "Evidence" }, markdown),
    ).toThrow(/requires both heading and headingLevel/);
    expect(() =>
      assertValidAnchor({ kind: "section", headingLevel: 2 }, markdown),
    ).toThrow(/requires both heading and headingLevel/);
  });

  it("rejects a heading not present in the markdown", () => {
    expect(() =>
      assertValidAnchor(
        { kind: "section", heading: "Nonexistent", headingLevel: 2 },
        markdown,
      ),
    ).toThrow(/was not found in the current Artifact/);
  });

  it("rejects a heading present at the wrong level", () => {
    expect(() =>
      assertValidAnchor(
        { kind: "section", heading: "Evidence", headingLevel: 3 },
        markdown,
      ),
    ).toThrow(/was not found in the current Artifact/);
  });

  it("accepts a heading matched case-insensitively at the right level", () => {
    expect(
      assertValidAnchor(
        { kind: "section", heading: "EVIDENCE", headingLevel: 2 },
        markdown,
      ),
    ).toEqual({ heading: "EVIDENCE", headingLevel: 2 });
  });
});

describe("authorRoleForActor", () => {
  it("returns founder/mentor/admin as-is", () => {
    expect(authorRoleForActor(actor("founder"))).toBe("founder");
    expect(authorRoleForActor(actor("mentor"))).toBe("mentor");
    expect(authorRoleForActor(actor("admin"))).toBe("admin");
  });

  it("throws INTERNAL_INVARIANT_ERROR for any other role", () => {
    expect(() => authorRoleForActor(actor("pending"))).toThrow(
      /Unexpected actor role "pending"/,
    );
  });
});
