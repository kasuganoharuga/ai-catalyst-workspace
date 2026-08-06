import { describe, expect, it } from "vitest";

import { DEFAULT_TOOLKIT_CONTENT } from "../../../content-seed/content/index.js";
import { validateConfigForValidator } from "./rule-schema.js";

describe("validateConfigForValidator", () => {
  it("parses every seeded artifact's validationConfig against its validator_key", () => {
    for (const module of DEFAULT_TOOLKIT_CONTENT.modules) {
      for (const artifact of module.artifacts) {
        expect(() =>
          validateConfigForValidator(artifact.validatorKey, artifact.validationConfig),
        ).not.toThrow();
      }
    }
  });

  it("rejects an unknown rule type under structured_markdown_v1", () => {
    expect(() =>
      validateConfigForValidator("structured_markdown_v1", {
        schemaVersion: 1,
        draftRules: [{ key: "bogus", type: "not_a_real_rule_type" }],
        submissionRules: [],
      }),
    ).toThrow();
  });

  it("rejects a rule with an unexpected extra field (.strict())", () => {
    expect(() =>
      validateConfigForValidator("structured_markdown_v1", {
        schemaVersion: 1,
        draftRules: [
          {
            key: "segment_present",
            type: "section_non_empty",
            level: 2,
            heading: "Segment",
            unexpectedField: "should not be allowed",
          },
        ],
        submissionRules: [],
      }),
    ).toThrow();
  });

  it("rejects a rule missing its required key", () => {
    expect(() =>
      validateConfigForValidator("structured_markdown_v1", {
        schemaVersion: 1,
        draftRules: [{ type: "section_non_empty", level: 2, heading: "Segment" }],
        submissionRules: [],
      }),
    ).toThrow();
  });

  it("requires the empty-object config for an artifact with no validator", () => {
    expect(() => validateConfigForValidator(null, {})).not.toThrow();
    expect(() => validateConfigForValidator(null, { draftRules: [] })).toThrow();
  });
});
