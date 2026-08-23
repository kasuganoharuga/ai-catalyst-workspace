import type { ModulePromptBindingContent, PromptContent } from "../../types.js";

import { withGlobalMarkdownRules } from "./global-rules.js";
import {
  PRESSURE_TEST_FACILITATOR_CONTENT,
  PRESSURE_TEST_ARTIFACT_GENERATOR_CONTENT,
} from "./pressure-test.js";
import {
  CUSTOMER_AVATAR_FACILITATOR_CONTENT,
  CUSTOMER_AVATAR_ARTIFACT_GENERATOR_CONTENT,
} from "./customer-avatar.js";
import {
  PROBLEM_STATEMENT_FACILITATOR_CONTENT,
  PROBLEM_STATEMENT_ARTIFACT_GENERATOR_CONTENT,
} from "./problem-statement.js";
import {
  SOLUTION_STATEMENT_FACILITATOR_CONTENT,
  SOLUTION_STATEMENT_ARTIFACT_GENERATOR_CONTENT,
} from "./solution-statement.js";
import {
  EPICS_USER_STORIES_FACILITATOR_CONTENT,
  EPICS_USER_STORIES_ARTIFACT_GENERATOR_CONTENT,
} from "./epics-user-stories.js";
import {
  COMPETITIVE_ANALYSIS_FACILITATOR_CONTENT,
  COMPETITIVE_ANALYSIS_ARTIFACT_GENERATOR_CONTENT,
} from "./competitive-analysis.js";
import {
  BUSINESS_MODEL_FACILITATOR_CONTENT,
  BUSINESS_MODEL_ARTIFACT_GENERATOR_CONTENT,
} from "./business-model.js";

export const PROMPTS_CONTENT: PromptContent[] = [
  {
    promptKey: "pressure_test_facilitator",
    name: "Pressure-Test Facilitator",
    description:
      "Interview-style guide for Module 1: collect-only Q1–Q6, one summary confirm, quiet persist, then a Verdict preview and confirm before save.",
    promptType: "module_facilitator",
    versionNumber: 1,
    content: withGlobalMarkdownRules(PRESSURE_TEST_FACILITATOR_CONTENT),
    contentFormat: "markdown",
    variableConfig: { variables: ["module_context"] },
  },
  {
    promptKey: "pressure_test_artifact_generator",
    name: "Pressure-Test Artifact Generator",
    description:
      "Generates the locked-schema Pressure-Test Verdict from confirmed Responses.",
    promptType: "artifact_generator",
    versionNumber: 1,
    content: withGlobalMarkdownRules(PRESSURE_TEST_ARTIFACT_GENERATOR_CONTENT),
    contentFormat: "markdown",
    variableConfig: {
      variables: ["confirmed_responses", "artifact_definition"],
    },
  },
  {
    promptKey: "customer_avatar_facilitator",
    name: "Ideal Customer Avatar Facilitator",
    description:
      "Continuous convergence guide for Module 2: one cognitive task at a time, meaningful grouped confirmations, quiet persistence and one final artefact review.",
    promptType: "module_facilitator",
    versionNumber: 1,
    content: withGlobalMarkdownRules(CUSTOMER_AVATAR_FACILITATOR_CONTENT),
    contentFormat: "markdown",
    variableConfig: { variables: ["module_context"] },
  },
  {
    promptKey: "customer_avatar_artifact_generator",
    name: "Ideal Customer Avatar Artifact Generator",
    description:
      "Generates the single Ideal Customer Avatar artefact from the 13 confirmed Responses.",
    promptType: "artifact_generator",
    versionNumber: 1,
    content: withGlobalMarkdownRules(
      CUSTOMER_AVATAR_ARTIFACT_GENERATOR_CONTENT,
    ),
    contentFormat: "markdown",
    variableConfig: {
      variables: ["confirmed_responses", "artifact_definition"],
    },
  },
  {
    promptKey: "problem_statement_facilitator",
    name: "Problem Statement Facilitator",
    description:
      "Continuous Module 3 problem-excavation guide: uninterrupted Five Whys, grouped convergence, quiet persistence and one combined artefact review.",
    promptType: "module_facilitator",
    versionNumber: 1,
    content: withGlobalMarkdownRules(PROBLEM_STATEMENT_FACILITATOR_CONTENT),
    contentFormat: "markdown",
    variableConfig: { variables: ["module_context"] },
  },
  {
    promptKey: "problem_statement_artifact_generator",
    name: "Problem Statement Artifact Generator",
    description:
      "Generates the root-cause Problem Statement and the five-question Problem Interview Guide from the 8 confirmed Responses.",
    promptType: "artifact_generator",
    versionNumber: 1,
    content: withGlobalMarkdownRules(
      PROBLEM_STATEMENT_ARTIFACT_GENERATOR_CONTENT,
    ),
    contentFormat: "markdown",
    variableConfig: {
      variables: ["confirmed_responses", "artifact_definition"],
    },
  },
  {
    promptKey: "solution_statement_facilitator",
    name: "Solution Statement Facilitator",
    description:
      "Staged Module 4 Solution guide: confirm and save the North Star before feature work, then converge features, benefits, ranking and assumption risks without per-field save cycles.",
    promptType: "module_facilitator",
    versionNumber: 1,
    content: withGlobalMarkdownRules(SOLUTION_STATEMENT_FACILITATOR_CONTENT),
    contentFormat: "markdown",
    variableConfig: { variables: ["module_context"] },
  },
  {
    promptKey: "solution_statement_artifact_generator",
    name: "Solution Statement Artifact Generator",
    description:
      "Generates North-Star.md and Feature-Benefit-Map.md from the eight confirmed Responses.",
    promptType: "artifact_generator",
    versionNumber: 1,
    content: withGlobalMarkdownRules(
      SOLUTION_STATEMENT_ARTIFACT_GENERATOR_CONTENT,
    ),
    contentFormat: "markdown",
    variableConfig: {
      variables: ["confirmed_responses", "artifact_definition"],
    },
  },
  {
    promptKey: "epics_user_stories_facilitator",
    name: "Epics & User Stories Facilitator",
    description:
      "Staged Module 5 backlog guide: confirm three epics, break down all three one Founder-chosen epic at a time, then score, rank and draw the MLP line with quiet persistence.",
    promptType: "module_facilitator",
    versionNumber: 1,
    content: withGlobalMarkdownRules(EPICS_USER_STORIES_FACILITATOR_CONTENT),
    contentFormat: "markdown",
    variableConfig: { variables: ["module_context"] },
  },
  {
    promptKey: "epics_user_stories_artifact_generator",
    name: "Epics & User Stories Artifact Generator",
    description:
      "Generates Epic-Charter.md and Sprint-Backlog.md from the six confirmed Responses, preserving Founder scores exactly.",
    promptType: "artifact_generator",
    versionNumber: 1,
    content: withGlobalMarkdownRules(
      EPICS_USER_STORIES_ARTIFACT_GENERATOR_CONTENT,
    ),
    contentFormat: "markdown",
    variableConfig: {
      variables: ["confirmed_responses", "artifact_definition"],
    },
  },
  {
    promptKey: "competitive_analysis_facilitator",
    name: "Competitive Analysis Facilitator",
    description:
      "Five-block Claude guide for Module 6: live-source landscape, Founder-led criteria matrix, exactly three status-labelled defensibility pillars, Founder-led positioning, then staged why now / why us — one confirm per block and silent saves.",
    promptType: "module_facilitator",
    versionNumber: 1,
    content: withGlobalMarkdownRules(COMPETITIVE_ANALYSIS_FACILITATOR_CONTENT),
    contentFormat: "markdown",
    variableConfig: { variables: ["module_context"] },
  },
  {
    promptKey: "competitive_analysis_artifact_generator",
    name: "Competitive Analysis Artifact Generator",
    description:
      "Generates Competitive-Landscape.md and Defensible-Position.md from the nine confirmed Responses, preserving source URLs, evidence flags, and exactly three status-labelled defensibility pillars.",
    promptType: "artifact_generator",
    versionNumber: 1,
    content: withGlobalMarkdownRules(
      COMPETITIVE_ANALYSIS_ARTIFACT_GENERATOR_CONTENT,
    ),
    contentFormat: "markdown",
    variableConfig: {
      variables: ["confirmed_responses", "artifact_definition"],
    },
  },
  {
    promptKey: "business_model_facilitator",
    name: "Business Model Facilitator",
    description:
      "Three-block Claude guide for Module 7: Founder constraints, an AI-led model including prices and 90-day cash flow, then a pricing pressure-test — one confirm per block and silent saves.",
    promptType: "module_facilitator",
    versionNumber: 1,
    content: withGlobalMarkdownRules(BUSINESS_MODEL_FACILITATOR_CONTENT),
    contentFormat: "markdown",
    variableConfig: { variables: ["module_context"] },
  },
  {
    promptKey: "business_model_artifact_generator",
    name: "Business Model Artifact Generator",
    description:
      "Generates Business-Model.md, Pricing-Strategy.md, and 90-Day-Cash-Flow.md from the eight confirmed Responses, preserving benchmarked/assumption tags.",
    promptType: "artifact_generator",
    versionNumber: 1,
    content: withGlobalMarkdownRules(BUSINESS_MODEL_ARTIFACT_GENERATOR_CONTENT),
    contentFormat: "markdown",
    variableConfig: {
      variables: ["confirmed_responses", "artifact_definition"],
    },
  },
];

export const MODULE_PROMPT_BINDINGS_CONTENT: ModulePromptBindingContent[] = [
  {
    moduleKey: "module-01-pressure-test",
    promptKey: "pressure_test_facilitator",
    purpose: "facilitator",
    sequenceIndex: 1,
    isRequired: true,
  },
  {
    moduleKey: "module-01-pressure-test",
    promptKey: "pressure_test_artifact_generator",
    purpose: "artifact_generator",
    sequenceIndex: 1,
    isRequired: true,
  },
  {
    moduleKey: "module-02-customer-avatar",
    promptKey: "customer_avatar_facilitator",
    purpose: "facilitator",
    sequenceIndex: 1,
    isRequired: true,
  },
  {
    moduleKey: "module-02-customer-avatar",
    promptKey: "customer_avatar_artifact_generator",
    purpose: "artifact_generator",
    sequenceIndex: 1,
    isRequired: true,
  },
  {
    moduleKey: "module-03-problem-statement",
    promptKey: "problem_statement_facilitator",
    purpose: "facilitator",
    sequenceIndex: 1,
    isRequired: true,
  },
  {
    moduleKey: "module-03-problem-statement",
    promptKey: "problem_statement_artifact_generator",
    purpose: "artifact_generator",
    sequenceIndex: 1,
    isRequired: true,
  },
  {
    moduleKey: "module-04-solution-statement",
    promptKey: "solution_statement_facilitator",
    purpose: "facilitator",
    sequenceIndex: 1,
    isRequired: true,
  },
  {
    moduleKey: "module-04-solution-statement",
    promptKey: "solution_statement_artifact_generator",
    purpose: "artifact_generator",
    sequenceIndex: 1,
    isRequired: true,
  },
  {
    moduleKey: "module-05-epics-user-stories",
    promptKey: "epics_user_stories_facilitator",
    purpose: "facilitator",
    sequenceIndex: 1,
    isRequired: true,
  },
  {
    moduleKey: "module-05-epics-user-stories",
    promptKey: "epics_user_stories_artifact_generator",
    purpose: "artifact_generator",
    sequenceIndex: 1,
    isRequired: true,
  },
  {
    moduleKey: "module-06-competitive-analysis",
    promptKey: "competitive_analysis_facilitator",
    purpose: "facilitator",
    sequenceIndex: 1,
    isRequired: true,
  },
  {
    moduleKey: "module-06-competitive-analysis",
    promptKey: "competitive_analysis_artifact_generator",
    purpose: "artifact_generator",
    sequenceIndex: 1,
    isRequired: true,
  },
  {
    moduleKey: "module-07-business-model",
    promptKey: "business_model_facilitator",
    purpose: "facilitator",
    sequenceIndex: 1,
    isRequired: true,
  },
  {
    moduleKey: "module-07-business-model",
    promptKey: "business_model_artifact_generator",
    purpose: "artifact_generator",
    sequenceIndex: 1,
    isRequired: true,
  },
];
