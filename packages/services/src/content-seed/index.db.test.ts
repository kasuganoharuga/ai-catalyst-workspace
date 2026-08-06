import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";

import { DEFAULT_TOOLKIT_CONTENT, seedToolkitContent } from "./index.js";
import type { ToolkitSeedContent } from "./types.js";

// A dedicated, randomly-suffixed content fixture — never the real
// DEFAULT_TOOLKIT_CONTENT keys — so this suite can never collide with (or
// destroy) content seeded for real, and never collides with a previous
// run of this same suite either. prompt_definitions/prompt_versions are
// intentionally never deleted once created, so a fresh random suffix per
// process run is what keeps repeated runs from colliding with each other.
const RUN_SUFFIX = randomBytes(4).toString("hex");

function buildTestContent(): ToolkitSeedContent {
  const promptKeyMap = new Map(
    DEFAULT_TOOLKIT_CONTENT.prompts.map((prompt) => [
      prompt.promptKey,
      `${prompt.promptKey}-test-${RUN_SUFFIX}`,
    ]),
  );

  return {
    program: {
      ...DEFAULT_TOOLKIT_CONTENT.program,
      programKey: `content-seed-test-${RUN_SUFFIX}`,
      versionLabel: `v1-test-${RUN_SUFFIX}`,
    },
    modules: DEFAULT_TOOLKIT_CONTENT.modules,
    prompts: DEFAULT_TOOLKIT_CONTENT.prompts.map((prompt) => ({
      ...prompt,
      promptKey: promptKeyMap.get(prompt.promptKey)!,
    })),
    promptBindings: DEFAULT_TOOLKIT_CONTENT.promptBindings.map((binding) => ({
      ...binding,
      promptKey: promptKeyMap.get(binding.promptKey)!,
    })),
  };
}

const TEST_CONTENT = buildTestContent();
const PROGRAM_KEY = TEST_CONTENT.program.programKey;

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

// `programs` cascades to program_versions -> module_definitions ->
// module_questions/artifact_definitions/module_prompt_bindings, none of
// which have a DB-level delete guard. prompt_definitions/prompt_versions
// are deliberately never deleted here: prompt_versions does have a real
// delete guard trigger once published, and — just like in production —
// reusing already-published, unchanged Prompt content across runs is the
// expected, supported case.
async function cleanupSeedContent(): Promise<void> {
  await pool.query("delete from programs where program_key = $1", [PROGRAM_KEY]);
}

async function fetchModuleRows(programVersionId: string) {
  const result = await pool.query<{
    id: string;
    module_key: string;
    status: string;
    sequence_index: number;
  }>(
    `select id, module_key, status, sequence_index
     from module_definitions
     where program_version_id = $1
     order by sequence_index`,
    [programVersionId],
  );
  return result.rows;
}

beforeEach(cleanupSeedContent);
afterAll(cleanupSeedContent);

describe("seedToolkitContent", () => {
  it("loads Module 0/1 content and publishes the Program Version on first run", async () => {
    const result = await withTransaction((client) => seedToolkitContent(client, TEST_CONTENT));

    expect(result.published).toBe(true);
    expect(result.programVersionStatus).toBe("published");
    expect(result.modulesReconciled).toBe(7);
    expect(result.promptsReconciled).toBe(8);

    const modules = await fetchModuleRows(result.programVersionId);
    expect(modules.map((row) => row.module_key)).toEqual([
      "module-00-setup",
      "module-01-pressure-test",
      "module-02-customer-avatar",
      "module-03-problem-statement",
      "module-04-evidence-of-unmet-need",
      "module-05-solution-options",
      "module-06-validation-plan",
    ]);
    expect(modules.filter((row) => row.status === "active")).toHaveLength(5);
    expect(modules.filter((row) => row.status === "draft")).toHaveLength(2);

    const module0 = modules.find((row) => row.module_key === "module-00-setup")!;
    const module1 = modules.find((row) => row.module_key === "module-01-pressure-test")!;

    const module0Artifacts = await pool.query(
      "select artifact_key from artifact_definitions where module_definition_id = $1",
      [module0.id],
    );
    expect(module0Artifacts.rows.map((row) => row.artifact_key)).toEqual(["setup_summary"]);

    const module0Questions = await pool.query(
      "select count(*) as count from module_questions where module_definition_id = $1",
      [module0.id],
    );
    expect(Number(module0Questions.rows[0].count)).toBe(0);

    const module1Questions = await pool.query(
      "select question_key from module_questions where module_definition_id = $1 order by sequence_index",
      [module1.id],
    );
    expect(module1Questions.rows.map((row) => row.question_key)).toEqual([
      "idea_one_sentence",
      "target_customer",
      "customer_problem",
      "business_model",
      "current_stage",
      "competitors_alternatives",
      "founder_decision",
      "pivot_detail",
    ]);

    const module1Bindings = await pool.query(
      "select purpose from module_prompt_bindings where module_definition_id = $1 order by purpose",
      [module1.id],
    );
    expect(module1Bindings.rows.map((row) => row.purpose)).toEqual([
      "artifact_generator",
      "facilitator",
    ]);
  });

  it("loads Module 2 (Target Customer) content with the right question and artifact contracts", async () => {
    const result = await withTransaction((client) => seedToolkitContent(client, TEST_CONTENT));
    const modules = await fetchModuleRows(result.programVersionId);
    const module2 = modules.find((row) => row.module_key === "module-02-customer-avatar")!;

    const questions = await pool.query<{
      question_key: string;
      response_type: string;
      options: unknown;
    }>(
      "select question_key, response_type, options from module_questions where module_definition_id = $1 order by sequence_index",
      [module2.id],
    );
    expect(questions.rows.map((row) => row.question_key)).toEqual([
      "customer_picture",
      "beachhead_segment",
      "customer_where",
      "customer_stage",
      "commercial_moment",
      "customer_situation",
      "functional_needs",
      "emotional_needs",
      "tier1_signals",
      "tier2_signals",
      "disqualifiers",
      "core_promise",
      "validation_status",
    ]);
    const validationStatus = questions.rows.find((row) => row.question_key === "validation_status")!;
    expect(validationStatus.response_type).toBe("single_choice");
    expect(validationStatus.options).toEqual([
      { value: "assumed", label: "Assumed" },
      { value: "interviewed", label: "Interviewed" },
      { value: "paying", label: "Paying" },
    ]);

    const artifacts = await pool.query<{
      artifact_key: string;
      required_filename: string;
      validator_key: string | null;
      renderer_key: string | null;
    }>(
      "select artifact_key, required_filename, validator_key, renderer_key from artifact_definitions where module_definition_id = $1",
      [module2.id],
    );
    expect(artifacts.rows).toEqual([
      {
        artifact_key: "ideal_customer_avatar",
        required_filename: "Ideal-Customer-Avatar.md",
        validator_key: "structured_markdown_v1",
        renderer_key: null,
      },
    ]);
  });

  it("loads Module 3 (Problem Statement) content with the right question and artifact contracts", async () => {
    const result = await withTransaction((client) => seedToolkitContent(client, TEST_CONTENT));
    const modules = await fetchModuleRows(result.programVersionId);
    const module3 = modules.find((row) => row.module_key === "module-03-problem-statement")!;

    const questions = await pool.query<{
      question_key: string;
      response_type: string;
      options: unknown;
    }>(
      "select question_key, response_type, options from module_questions where module_definition_id = $1 order by sequence_index",
      [module3.id],
    );
    expect(questions.rows.map((row) => row.question_key)).toEqual([
      "problem_draft",
      "current_alternatives",
      "five_whys_ladder",
      "root_cause",
      "problem_statement",
      "pain_intensity",
      "priority_evidence",
      "validation_status",
    ]);
    const validationStatus = questions.rows.find((row) => row.question_key === "validation_status")!;
    expect(validationStatus.response_type).toBe("single_choice");
    expect(validationStatus.options).toEqual([
      { value: "assumed", label: "Assumed" },
      { value: "interviewed", label: "Interviewed" },
      { value: "validated", label: "Validated" },
    ]);

    const artifacts = await pool.query<{
      artifact_key: string;
      required_filename: string;
      validator_key: string | null;
      renderer_key: string | null;
    }>(
      "select artifact_key, required_filename, validator_key, renderer_key from artifact_definitions where module_definition_id = $1 order by sequence_index",
      [module3.id],
    );
    expect(artifacts.rows).toEqual([
      {
        artifact_key: "problem_statement",
        required_filename: "Problem-Statement.md",
        validator_key: "structured_markdown_v1",
        renderer_key: null,
      },
      {
        artifact_key: "problem_interview_guide",
        required_filename: "Problem-Interview-Guide.md",
        validator_key: "structured_markdown_v1",
        renderer_key: null,
      },
    ]);
  });

  it("loads Module 4 (Proof) content with the right question and artifact contracts", async () => {
    const result = await withTransaction((client) => seedToolkitContent(client, TEST_CONTENT));
    const modules = await fetchModuleRows(result.programVersionId);
    const module4 = modules.find((row) => row.module_key === "module-04-evidence-of-unmet-need")!;

    const questions = await pool.query<{
      question_key: string;
      response_type: string;
      options: unknown;
    }>(
      "select question_key, response_type, options from module_questions where module_definition_id = $1 order by sequence_index",
      [module4.id],
    );
    expect(questions.rows.map((row) => row.question_key)).toEqual([
      "evidence_additions",
      "evidence_level",
      "evidence_level_reasoning",
      "observed_behaviour",
      "strongest_counterargument",
      "counterargument_defence",
      "validation_constraints",
    ]);
    const evidenceLevel = questions.rows.find((row) => row.question_key === "evidence_level")!;
    expect(evidenceLevel.response_type).toBe("single_choice");
    expect(evidenceLevel.options).toEqual([
      { value: "assumption", label: "Assumption" },
      { value: "secondary_research", label: "Secondary research" },
      { value: "primary_research", label: "Primary research" },
      { value: "demand_signal", label: "Demand signal" },
      { value: "paying", label: "Paying" },
    ]);

    const artifacts = await pool.query<{
      artifact_key: string;
      required_filename: string;
      validator_key: string | null;
      renderer_key: string | null;
    }>(
      "select artifact_key, required_filename, validator_key, renderer_key from artifact_definitions where module_definition_id = $1 order by sequence_index",
      [module4.id],
    );
    expect(artifacts.rows).toEqual([
      {
        artifact_key: "evidence_of_unmet_need",
        required_filename: "Evidence-Of-Unmet-Need.md",
        validator_key: "structured_markdown_v1",
        renderer_key: null,
      },
      {
        artifact_key: "validation_roadmap_30_day",
        required_filename: "Validation-Roadmap-30-Day.md",
        validator_key: "structured_markdown_v1",
        renderer_key: null,
      },
      // Last, and the only one without a validator: the raw interview record is
      // this Module's input, accepted at whatever quality it arrives in.
      {
        artifact_key: "interview_notes",
        required_filename: "Interview-Notes.md",
        validator_key: null,
        renderer_key: null,
      },
    ]);
  });

  it("running it twice is a no-op that changes no ids or timestamps", async () => {
    const first = await withTransaction((client) => seedToolkitContent(client, TEST_CONTENT));

    const before = await pool.query(
      "select updated_at, published_at from program_versions where id = $1",
      [first.programVersionId],
    );

    const second = await withTransaction((client) => seedToolkitContent(client, TEST_CONTENT));

    expect(second.programVersionId).toBe(first.programVersionId);
    expect(second.published).toBe(false);
    expect(second.programVersionStatus).toBe("published");

    const after = await pool.query(
      "select updated_at, published_at from program_versions where id = $1",
      [first.programVersionId],
    );
    expect(after.rows[0].updated_at).toEqual(before.rows[0].updated_at);
    expect(after.rows[0].published_at).toEqual(before.rows[0].published_at);

    const moduleCount = await pool.query(
      "select count(*) as count from module_definitions where program_version_id = $1",
      [first.programVersionId],
    );
    expect(Number(moduleCount.rows[0].count)).toBe(7);
  });

  it("rejects a content change to already-published rows instead of overwriting them", async () => {
    await withTransaction((client) => seedToolkitContent(client, TEST_CONTENT));

    const originalQuestionText = TEST_CONTENT.modules
      .find((module) => module.moduleKey === "module-01-pressure-test")!
      .questions.find((question) => question.questionKey === "idea_one_sentence")!.questionText;

    const mutated: ToolkitSeedContent = {
      ...TEST_CONTENT,
      modules: TEST_CONTENT.modules.map((module) =>
        module.moduleKey === "module-01-pressure-test"
          ? {
              ...module,
              questions: module.questions.map((question) =>
                question.questionKey === "idea_one_sentence"
                  ? { ...question, questionText: "Changed after publish — should be rejected" }
                  : question,
              ),
            }
          : module,
      ),
    };

    await expect(
      withTransaction((client) => seedToolkitContent(client, mutated)),
    ).rejects.toMatchObject({
      name: "ContentSeedError",
      code: "PUBLISHED_CONTENT_MISMATCH",
    });

    const modules = await fetchModuleRows(
      (await pool.query<{ id: string }>(
        `select pv.id from program_versions pv
         join programs p on p.id = pv.program_id
         where p.program_key = $1`,
        [PROGRAM_KEY],
      )).rows[0].id,
    );
    const module1 = modules.find((row) => row.module_key === "module-01-pressure-test")!;
    const row = await pool.query(
      "select question_text from module_questions where module_definition_id = $1 and question_key = 'idea_one_sentence'",
      [module1.id],
    );
    expect(row.rows[0].question_text).toBe(originalQuestionText);
  });

  it("updates prompt_definitions name/description drift in place", async () => {
    await withTransaction((client) => seedToolkitContent(client, TEST_CONTENT));

    const target = TEST_CONTENT.prompts[0]!;
    await pool.query(
      `update prompt_definitions
       set description = 'Stale catalog copy that should be corrected on the next seed'
       where prompt_key = $1`,
      [target.promptKey],
    );

    const result = await withTransaction((client) => seedToolkitContent(client, TEST_CONTENT));
    expect(result.published).toBe(false);
    expect(result.programVersionStatus).toBe("published");

    const row = await pool.query<{ description: string }>(
      "select description from prompt_definitions where prompt_key = $1",
      [target.promptKey],
    );
    expect(row.rows[0].description).toBe(target.description);
  });

  it("rejects prompt_definitions prompt_type drift", async () => {
    await withTransaction((client) => seedToolkitContent(client, TEST_CONTENT));

    const target = TEST_CONTENT.prompts[0]!;
    const otherType =
      target.promptType === "module_facilitator"
        ? ("artifact_generator" as const)
        : ("module_facilitator" as const);

    const mutated: ToolkitSeedContent = {
      ...TEST_CONTENT,
      prompts: TEST_CONTENT.prompts.map((prompt, index) =>
        index === 0 ? { ...prompt, promptType: otherType } : prompt,
      ),
    };

    await expect(
      withTransaction((client) => seedToolkitContent(client, mutated)),
    ).rejects.toMatchObject({
      name: "ContentSeedError",
      code: "PUBLISHED_CONTENT_MISMATCH",
    });
  });

  it("rejects extra content rows not present in the content constants", async () => {
    const first = await withTransaction((client) => seedToolkitContent(client, TEST_CONTENT));
    const modules = await fetchModuleRows(first.programVersionId);
    const module1 = modules.find((row) => row.module_key === "module-01-pressure-test")!;

    await pool.query(
      `insert into module_questions (module_definition_id, question_key, sequence_index, question_text, response_type)
       values ($1, 'unexpected_extra_question', 99, 'This question was not seeded by the script', 'short_text')`,
      [module1.id],
    );

    await expect(
      withTransaction((client) => seedToolkitContent(client, TEST_CONTENT)),
    ).rejects.toMatchObject({
      name: "ContentSeedError",
      code: "CONTENT_GRAPH_MISMATCH",
    });
  });

  it("rolls back the entire transaction when a publish precondition fails", async () => {
    const module0 = TEST_CONTENT.modules.find(
      (module) => module.moduleKey === "module-00-setup",
    )!;
    const brokenModule0 = { ...module0, artifacts: [] };
    const brokenContent: ToolkitSeedContent = {
      ...TEST_CONTENT,
      modules: TEST_CONTENT.modules.map((module) =>
        module.moduleKey === "module-00-setup" ? brokenModule0 : module,
      ),
    };

    await expect(
      withTransaction((client) => seedToolkitContent(client, brokenContent)),
    ).rejects.toMatchObject({
      name: "ContentSeedError",
      code: "PUBLISH_PRECONDITION_FAILED",
    });

    const programRow = await pool.query("select id from programs where program_key = $1", [
      PROGRAM_KEY,
    ]);
    expect(programRow.rows).toHaveLength(0);
  });

  it("serializes concurrent runs via the advisory lock instead of racing a unique-constraint violation", async () => {
    const [first, second] = await Promise.all([
      withTransaction((client) => seedToolkitContent(client, TEST_CONTENT)),
      withTransaction((client) => seedToolkitContent(client, TEST_CONTENT)),
    ]);

    expect(first.programVersionStatus).toBe("published");
    expect(second.programVersionStatus).toBe("published");
    expect(first.programVersionId).toBe(second.programVersionId);
  });

  it("models pivot_detail as conditionally required, not just allow_skip", async () => {
    const result = await withTransaction((client) => seedToolkitContent(client, TEST_CONTENT));
    const modules = await fetchModuleRows(result.programVersionId);
    const module1 = modules.find((row) => row.module_key === "module-01-pressure-test")!;

    const row = await pool.query(
      "select is_required, allow_skip, conditions from module_questions where module_definition_id = $1 and question_key = 'pivot_detail'",
      [module1.id],
    );

    expect(row.rows[0].is_required).toBe(false);
    expect(row.rows[0].allow_skip).toBe(true);
    expect(row.rows[0].conditions).toEqual({
      depends_on: "founder_decision",
      operator: "equals",
      value: "pivot",
    });
  });

  it("keeps exactly 5 active Modules and 2 draft placeholders with no sequence_index conflicts", async () => {
    const result = await withTransaction((client) => seedToolkitContent(client, TEST_CONTENT));
    const modules = await fetchModuleRows(result.programVersionId);

    expect(modules.filter((row) => row.status === "active")).toHaveLength(5);
    expect(modules.filter((row) => row.status === "draft")).toHaveLength(2);

    const sequenceIndexes = modules.map((row) => row.sequence_index);
    expect(new Set(sequenceIndexes).size).toBe(sequenceIndexes.length);
  });
});
