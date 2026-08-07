import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import {
  createFixtureFounderAccount,
  createFixtureVenture,
  withTransaction,
} from "@ai-catalyst/services/testing/db-fixtures";

import { getOrCreateProgramRun } from "../../workflow/index.js";
import { seedToolkitContent } from "../index.js";
import type { ToolkitSeedContent } from "../types.js";
import { freezeProgramVersion } from "./freeze.js";

type FixtureModule = ToolkitSeedContent["modules"][number];
type FixtureArtifact = FixtureModule["artifacts"][number];
type FixturePrompt = ToolkitSeedContent["prompts"][number];
type FixtureBinding = ToolkitSeedContent["promptBindings"][number];

function buildArtifact(artifactKey: string): FixtureArtifact {
  return {
    artifactKey,
    sequenceIndex: 1,
    name: `Fixture ${artifactKey}`,
    description: null,
    isRequired: true,
    artifactType: "document",
    sourceFormat: "markdown",
    outputFormat: "markdown",
    requiredFilename: `${artifactKey}.md`,
    rendererKey: null,
    validatorKey: null,
    allowedMimeTypes: ["text/markdown"],
    maxFileSizeBytes: 10_000,
    maxFiles: 1,
    validationConfig: {},
    outputConfig: {},
  };
}

function buildModule(moduleKey: string, sequenceIndex: number): FixtureModule {
  return {
    moduleKey,
    sequenceIndex,
    title: `Fixture ${moduleKey}`,
    subtitle: null,
    description: null,
    objective: null,
    moduleType: "standard",
    isRequired: true,
    allowRevisions: true,
    completionMode: "artifact",
    estimatedMinutes: null,
    isPublishable: true,
    questions: [],
    artifacts: [buildArtifact(`${moduleKey}-artifact`)],
  };
}

function buildPrompt(promptKey: string): FixturePrompt {
  return {
    promptKey,
    name: `Fixture ${promptKey}`,
    description: null,
    promptType: "module_facilitator",
    versionNumber: 1,
    content: `Fixture content for ${promptKey} v1`,
    contentFormat: "markdown",
    variableConfig: {},
  };
}

describe("freezeProgramVersion — database integration", () => {
  const RUN_SUFFIX = randomBytes(4).toString("hex");
  const emailPrefix = `freeze-test-${RUN_SUFFIX}`;
  const createdUserIds: string[] = [];
  const createdProgramKeys: string[] = [];

  function buildContent(
    programKey: string,
    modules: FixtureModule[],
    options: { promptKey?: string; bindings?: FixtureBinding[] } = {},
  ): ToolkitSeedContent {
    createdProgramKeys.push(programKey);
    const prompts = options.promptKey ? [buildPrompt(options.promptKey)] : [];
    return {
      program: {
        programKey,
        programName: `Freeze test program ${programKey}`,
        programDescription: null,
        versionNumber: 1,
        versionLabel: `v1-${programKey}`,
        versionName: `Fixture v1 ${programKey}`,
        versionDescription: null,
        contentLock: "mutable",
        releaseNotes: null,
      },
      modules,
      prompts,
      promptBindings: options.bindings ?? [],
    };
  }

  async function createFounderWithVenture(
    label: string,
  ): Promise<{ actor: ActorContext; ventureId: string }> {
    const { userId, workspaceId } = await createFixtureFounderAccount({
      label,
      emailPrefix,
      slugPrefix: "freeze-test",
    });
    createdUserIds.push(userId);

    const ventureId = await createFixtureVenture({
      workspaceId,
      createdByUserId: userId,
      label,
      slugPrefix: "freeze-venture",
    });

    return { actor: { userId, role: "founder" }, ventureId };
  }

  afterAll(async () => {
    await pool.query("delete from user_active_contexts where user_id = any($1::uuid[])", [
      createdUserIds,
    ]);
    await pool.query(
      "delete from ventures where workspace_id in (select id from workspaces where founder_user_id = any($1::uuid[]))",
      [createdUserIds],
    );
    await pool.query("delete from workspaces where founder_user_id = any($1::uuid[])", [
      createdUserIds,
    ]);
    await pool.query("delete from users where id = any($1::uuid[])", [createdUserIds]);
    await pool.query("delete from programs where program_key = any($1::text[])", [createdProgramKeys]);
  });

  it("freezes a mutable program_version and cascades to its reachable prompt_versions", async () => {
    const programKey = `freeze-basic-${RUN_SUFFIX}`;
    const promptKey = `freeze-basic-prompt-${RUN_SUFFIX}`;
    const content = buildContent(programKey, [buildModule("m1", 1)], {
      promptKey,
      bindings: [{ moduleKey: "m1", promptKey, purpose: "facilitator", sequenceIndex: 1, isRequired: true }],
    });
    await withTransaction((client) => seedToolkitContent(client, content));

    const result = await withTransaction((client) => freezeProgramVersion(client, { content }));
    expect(result.frozenPromptVersions).toEqual([{ promptKey, versionNumber: 1 }]);

    const programRow = await pool.query<{ content_lock: string }>(
      `select pv.content_lock from program_versions pv join programs p on p.id = pv.program_id where p.program_key = $1`,
      [programKey],
    );
    expect(programRow.rows[0].content_lock).toBe("frozen");

    const promptRow = await pool.query<{ content_lock: string }>(
      `select content_lock from prompt_versions where prompt_definition_id = (select id from prompt_definitions where prompt_key = $1)`,
      [promptKey],
    );
    expect(promptRow.rows[0].content_lock).toBe("frozen");
  });

  it("rejects freezing an already-frozen program_version", async () => {
    const programKey = `freeze-twice-${RUN_SUFFIX}`;
    const content = buildContent(programKey, [buildModule("m1", 1)]);
    await withTransaction((client) => seedToolkitContent(client, content));
    await withTransaction((client) => freezeProgramVersion(client, { content }));

    await expect(
      withTransaction((client) => freezeProgramVersion(client, { content })),
    ).rejects.toMatchObject({ name: "ContentSeedError", code: "PROGRAM_VERSION_NOT_MUTABLE" });
  });

  it("rejects freezing when a Program Run has a pending reconciliation", async () => {
    const programKey = `freeze-drift-${RUN_SUFFIX}`;
    const content = buildContent(programKey, [buildModule("m1", 1)]);
    await withTransaction((client) => seedToolkitContent(client, content));

    const { actor, ventureId } = await createFounderWithVenture("drift");
    await getOrCreateProgramRun(actor, { ventureId }, { programKey });

    // Add a Module after the Run was created, WITHOUT reconciling it —
    // this Run is now behind.
    const grown = buildContent(programKey, [buildModule("m1", 1), buildModule("m2", 2)]);
    await withTransaction((client) => seedToolkitContent(client, grown));

    await expect(
      withTransaction((client) => freezeProgramVersion(client, { content: grown })),
    ).rejects.toMatchObject({ name: "ContentSeedError", code: "RUN_RECONCILIATION_PENDING" });

    // Reconciling first, then freezing, must succeed.
    await getOrCreateProgramRun(actor, { ventureId }, { programKey });
    const result = await withTransaction((client) => freezeProgramVersion(client, { content: grown }));
    expect(result.programVersionId).toBeTruthy();
  });

  it("blocks freezing a prompt still shared with a different mutable program_version, unless allowed", async () => {
    const sharedPromptKey = `freeze-shared-prompt-${RUN_SUFFIX}`;
    const programAKey = `freeze-shared-a-${RUN_SUFFIX}`;
    const programBKey = `freeze-shared-b-${RUN_SUFFIX}`;

    const bindingFor = (moduleKey: string): FixtureBinding[] => [
      { moduleKey, promptKey: sharedPromptKey, purpose: "facilitator", sequenceIndex: 1, isRequired: true },
    ];

    const contentA = buildContent(programAKey, [buildModule("m1", 1)], {
      promptKey: sharedPromptKey,
      bindings: bindingFor("m1"),
    });
    await withTransaction((client) => seedToolkitContent(client, contentA));

    // Program B reuses the SAME prompt_key/versionNumber — reconcilePromptVersion
    // finds the existing (still-mutable, unchanged) row and reuses it rather
    // than erroring, exactly like two living program_versions sharing one
    // global prompt in production.
    const contentB = buildContent(programBKey, [buildModule("m1", 1)], {
      promptKey: sharedPromptKey,
      bindings: bindingFor("m1"),
    });
    await withTransaction((client) => seedToolkitContent(client, contentB));

    await expect(
      withTransaction((client) => freezeProgramVersion(client, { content: contentA })),
    ).rejects.toMatchObject({ name: "ContentSeedError", code: "SHARED_MUTABLE_PROMPT_DEPENDENCY" });

    // Program A itself must remain untouched (still mutable) after the
    // rejected attempt — the whole transaction rolled back.
    const stillMutable = await pool.query<{ content_lock: string }>(
      `select pv.content_lock from program_versions pv join programs p on p.id = pv.program_id where p.program_key = $1`,
      [programAKey],
    );
    expect(stillMutable.rows[0].content_lock).toBe("mutable");

    const result = await withTransaction((client) =>
      freezeProgramVersion(client, { content: contentA, allowSharedPromptFreeze: true }),
    );
    expect(result.frozenPromptVersions).toEqual([{ promptKey: sharedPromptKey, versionNumber: 1 }]);

    // Program B's seed must still succeed unchanged (no-op) reusing the
    // now-frozen prompt_version...
    await withTransaction((client) => seedToolkitContent(client, contentB));

    // ...but if Program B tries to CHANGE that prompt's content, it must
    // now be rejected — freeze took away its editing rights.
    const changedB: ToolkitSeedContent = {
      ...contentB,
      prompts: contentB.prompts.map((prompt) => ({ ...prompt, content: "changed after freeze" })),
    };
    await expect(
      withTransaction((client) => seedToolkitContent(client, changedB)),
    ).rejects.toMatchObject({ name: "ContentSeedError", code: "PUBLISHED_CONTENT_MISMATCH" });
  });
});
