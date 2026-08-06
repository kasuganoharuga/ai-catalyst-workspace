import { describe, expect, it } from "vitest";

import {
  extractLabelValue,
  getSection,
  parseTable,
  sectionExists,
  tableColumnIndex,
} from "../../artifact/internal/markdown-sections.js";
import type {
  DraftRule,
  StructuredMarkdownValidationConfig,
  SubmissionRule,
} from "../../artifact/internal/validators/rule-schema.js";
import { DEFAULT_TOOLKIT_CONTENT } from "./index.js";
import type { ArtifactContent } from "../types.js";

// Proves the rules point at things that actually exist in the seeded
// template — sections_exist/section_non_empty/etc. match headings
// literally, so a rule referencing a renamed or misspelled heading would
// simply never fire, and its check would silently never run. String
// equality between the template and the prompt-set source (tested
// elsewhere) does not catch this — only cross-checking the rules against
// the template's actual structure does.

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countLabelOccurrences(content: string, label: string): number {
  const escaped = escapeForRegex(label);
  const boldPattern = new RegExp(`^\\s*\\*\\*${escaped}:\\*\\*`, "gim");
  const listItemPattern = new RegExp(`^\\s*[-*](?!\\*)\\s+${escaped}:\\s*`, "gim");
  const boldMatches = content.match(boldPattern) ?? [];
  const listMatches = content.match(listItemPattern) ?? [];
  return boldMatches.length + listMatches.length;
}

function scopedContent(
  template: string,
  scope: { level: number; heading: string } | undefined,
): string {
  if (!scope) return template;
  const section = getSection(template, scope.level, scope.heading);
  expect(section, `scope ${scope.level}:${scope.heading} must exist in the template`).not.toBeNull();
  return section!;
}

function checkHeadingRef(template: string, level: number, heading: string, ruleKey: string) {
  expect(
    sectionExists(template, level, heading),
    `rule "${ruleKey}" references heading "${heading}" at level ${level}, which does not exist in the template`,
  ).toBe(true);
}

function checkTableColumn(template: string, level: number, heading: string, column: string, ruleKey: string) {
  checkHeadingRef(template, level, heading, ruleKey);
  const body = getSection(template, level, heading)!;
  const table = parseTable(body);
  expect(table, `rule "${ruleKey}"'s heading "${heading}" must contain a Markdown table`).not.toBeNull();
  expect(
    tableColumnIndex(table!.headers, column),
    `rule "${ruleKey}" references column "${column}", which is not one of [${table!.headers.join(", ")}] under "${heading}"`,
  ).toBeGreaterThanOrEqual(0);
}

function checkLabel(
  template: string,
  label: string,
  scope: { level: number; heading: string } | undefined,
  ruleKey: string,
) {
  if (scope) {
    checkHeadingRef(template, scope.level, scope.heading, ruleKey);
  }
  const content = scopedContent(template, scope);
  expect(
    extractLabelValue(content, label),
    `rule "${ruleKey}" references label "${label}"${scope ? ` scoped to ${scope.heading}` : ""}, which was not found`,
  ).not.toBeNull();

  if (!scope) {
    const occurrences = countLabelOccurrences(template, label);
    expect(
      occurrences,
      `rule "${ruleKey}" references unscoped label "${label}", which appears ${occurrences} times in the template — an unscoped rule must be unambiguous`,
    ).toBe(1);
  }
}

function checkDraftRule(template: string, rule: DraftRule) {
  switch (rule.type) {
    case "sections_exist":
      for (const section of rule.sections) {
        checkHeadingRef(template, section.level, section.heading, rule.key);
      }
      return;
    case "section_non_empty":
    case "minimum_named_items":
    case "range_named_items":
    case "minimum_table_rows":
    case "range_table_rows":
      checkHeadingRef(template, rule.level, rule.heading, rule.key);
      return;
    case "table_required_cells":
      checkHeadingRef(template, rule.level, rule.heading, rule.key);
      for (const column of rule.requiredColumns) {
        checkTableColumn(template, rule.level, rule.heading, column, rule.key);
      }
      return;
    case "table_column_exact_sequence":
    case "table_column_integer_range":
    case "table_column_enum":
    case "table_column_scored_reasoning":
      checkTableColumn(template, rule.level, rule.heading, rule.column, rule.key);
      return;
    case "label_present":
    case "label_enum":
      checkLabel(template, rule.label, rule.scope, rule.key);
      return;
  }
}

function checkSubmissionRule(template: string, rule: SubmissionRule) {
  switch (rule.type) {
    case "label_matches_response":
      checkLabel(template, rule.label, rule.scope, rule.key);
      return;
    case "labels_agree":
      checkLabel(template, rule.labelA.label, rule.labelA.scope, rule.key);
      checkLabel(template, rule.labelB.label, rule.labelB.scope, rule.key);
      return;
    case "labels_match_first_table_row":
      checkHeadingRef(template, rule.table.level, rule.table.heading, rule.key);
      for (const mapping of rule.mappings) {
        checkLabel(template, mapping.label, mapping.scope, rule.key);
        checkTableColumn(template, rule.table.level, rule.table.heading, mapping.column, rule.key);
      }
      return;
  }
}

function isStructuredMarkdownConfig(
  config: unknown,
): config is StructuredMarkdownValidationConfig {
  return (
    typeof config === "object" &&
    config !== null &&
    "schemaVersion" in config &&
    "draftRules" in config
  );
}

function structuredMarkdownArtifacts(): Array<{ moduleKey: string; artifact: ArtifactContent }> {
  const result: Array<{ moduleKey: string; artifact: ArtifactContent }> = [];
  for (const module of DEFAULT_TOOLKIT_CONTENT.modules) {
    for (const artifact of module.artifacts) {
      if (artifact.validatorKey === "structured_markdown_v1") {
        result.push({ moduleKey: module.moduleKey, artifact });
      }
    }
  }
  return result;
}

describe("structured_markdown_v1 config-to-template contract", () => {
  const artifacts = structuredMarkdownArtifacts();

  it("finds at least one structured_markdown_v1 artifact to check", () => {
    expect(artifacts.length).toBeGreaterThan(0);
  });

  for (const { moduleKey, artifact } of artifacts) {
    describe(`${moduleKey} / ${artifact.artifactKey}`, () => {
      const config = artifact.validationConfig;
      if (!isStructuredMarkdownConfig(config)) {
        throw new Error(`${artifact.artifactKey}: expected a structured_markdown_v1 config`);
      }
      const template = (artifact.outputConfig as { templateMarkdown: string }).templateMarkdown;

      it("has no duplicate rule keys", () => {
        const keys = [...config.draftRules, ...config.submissionRules].map((rule) => rule.key);
        expect(new Set(keys).size).toBe(keys.length);
      });

      it("every draft rule references headings/labels/columns that exist in the template", () => {
        for (const rule of config.draftRules) {
          checkDraftRule(template, rule);
        }
      });

      it("every submission rule references headings/labels/columns that exist in the template", () => {
        for (const rule of config.submissionRules) {
          checkSubmissionRule(template, rule);
        }
      });
    });
  }
});
