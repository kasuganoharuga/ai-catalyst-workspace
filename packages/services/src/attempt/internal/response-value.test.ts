import { describe, expect, it } from "vitest";

import {
  escapeRegExp,
  listOptionValues,
  optionsInclude,
  parseNonEmptyConditions,
  resolveSingleChoiceValue,
} from "./response-value.js";

function option(value: string, label = value) {
  return { value, label };
}

describe("parseNonEmptyConditions", () => {
  it("returns null for an empty object (module_questions.conditions' default)", () => {
    expect(parseNonEmptyConditions({})).toBeNull();
  });

  it("returns null for null or a non-object", () => {
    expect(parseNonEmptyConditions(null)).toBeNull();
    expect(parseNonEmptyConditions("not an object")).toBeNull();
    expect(parseNonEmptyConditions(42)).toBeNull();
  });

  it("returns null when depends_on is missing or not a string", () => {
    expect(
      parseNonEmptyConditions({ operator: "equals", value: "x" }),
    ).toBeNull();
    expect(
      parseNonEmptyConditions({
        depends_on: 123,
        operator: "equals",
        value: "x",
      }),
    ).toBeNull();
  });

  it("returns null when operator is not exactly 'equals'", () => {
    expect(
      parseNonEmptyConditions({
        depends_on: "q1",
        operator: "not_equals",
        value: "x",
      }),
    ).toBeNull();
  });

  it("parses a well-formed condition", () => {
    expect(
      parseNonEmptyConditions({
        depends_on: "q1",
        operator: "equals",
        value: "yes",
      }),
    ).toEqual({ depends_on: "q1", operator: "equals", value: "yes" });
  });
});

describe("listOptionValues", () => {
  it("returns an empty array for non-array input", () => {
    expect(listOptionValues(null)).toEqual([]);
    expect(listOptionValues("not an array")).toEqual([]);
    expect(listOptionValues(undefined)).toEqual([]);
  });

  it("extracts value from well-formed option objects", () => {
    expect(listOptionValues([option("a"), option("b")])).toEqual(["a", "b"]);
  });

  it("skips malformed entries without a string value", () => {
    expect(
      listOptionValues([option("a"), { label: "no value field" }, 42, null]),
    ).toEqual(["a"]);
  });
});

describe("optionsInclude", () => {
  it("is true when the value matches an option", () => {
    expect(optionsInclude([option("yes"), option("no")], "yes")).toBe(true);
  });

  it("is false when the value matches nothing", () => {
    expect(optionsInclude([option("yes"), option("no")], "maybe")).toBe(false);
  });
});

describe("escapeRegExp", () => {
  it("escapes regex special characters", () => {
    expect(escapeRegExp("a.b*c?")).toBe("a\\.b\\*c\\?");
  });

  it("leaves plain alphanumeric text untouched", () => {
    expect(escapeRegExp("plain text 123")).toBe("plain text 123");
  });
});

describe("resolveSingleChoiceValue", () => {
  const options = [option("Yes"), option("No"), option("Not sure")];

  it("throws VALIDATION_ERROR when no options are configured", () => {
    expect(() => resolveSingleChoiceValue("q1", [], "Yes")).toThrow(
      /requires a value matching one of its options/,
    );
  });

  it("accepts an exact string match", () => {
    expect(resolveSingleChoiceValue("q1", options, "Yes")).toBe("Yes");
  });

  it("trims whitespace on an exact match", () => {
    expect(resolveSingleChoiceValue("q1", options, "  Yes  ")).toBe("Yes");
  });

  it("accepts a value embedded in free text when exactly one option matches unambiguously", () => {
    expect(
      resolveSingleChoiceValue("q1", options, "I'd say Yes, definitely"),
    ).toBe("Yes");
  });

  it("rejects free text that matches more than one option", () => {
    // "No" is a substring boundary match inside "Not sure" is avoided by
    // the word-boundary regex, but construct a genuine two-way ambiguity.
    const ambiguousOptions = [option("Cat"), option("Cats")];
    expect(() =>
      resolveSingleChoiceValue("q1", ambiguousOptions, "I like Cat and Cats"),
    ).toThrow(/requires a value matching one of its options/);
  });

  it("accepts a value wrapped in a known envelope field", () => {
    expect(resolveSingleChoiceValue("q1", options, { value: "No" })).toBe("No");
    expect(resolveSingleChoiceValue("q1", options, { answer: "Yes" })).toBe(
      "Yes",
    );
    expect(
      resolveSingleChoiceValue("q1", options, { selection: "Not sure" }),
    ).toBe("Not sure");
  });

  it("does not deep-scan an object with no known wrapper field", () => {
    expect(() =>
      resolveSingleChoiceValue("q1", options, { weird: "Yes" }),
    ).toThrow(/requires a value matching one of its options/);
  });

  it("rejects a value with no match at all", () => {
    expect(() =>
      resolveSingleChoiceValue("q1", options, "Definitely not an option"),
    ).toThrow(/requires a value matching one of its options/);
  });
});
