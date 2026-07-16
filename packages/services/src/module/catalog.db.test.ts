import { randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import {
  DEFAULT_TOOLKIT_CONTENT,
  seedToolkitContent,
} from "@ai-catalyst/services/content-seed";
import type { ToolkitSeedContent } from "@ai-catalyst/services/content-seed";

import { getModuleCatalogEntry, listModuleCatalog } from "./catalog.js";

type FixtureModule = ToolkitSeedContent["modules"][number];
type FixtureArtifact = FixtureModule["artifacts"][number];

function founderActor(): ActorContext {
  return { userId: randomUUID(), role: "founder" };
}

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

function buildFixtureArtifact(
  artifactKey: string,
  sequenceIndex: number,
  name: string,
  requiredFilename: string,
): FixtureArtifact {
  return {
    artifactKey,
    sequenceIndex,
    name,
    description: null,
    isRequired: true,
    artifactType: "document",
    sourceFormat: "markdown",
    outputFormat: "markdown",
    requiredFilename,
    rendererKey: null,
    validatorKey: null,
    allowedMimeTypes: ["text/markdown"],
    maxFileSizeBytes: 10_000,
    maxFiles: 1,
    validationConfig: {},
    outputConfig: {},
  };
}

function buildFixtureModule(
  moduleKey: string,
  sequenceIndex: number,
  artifacts: FixtureArtifact[],
): FixtureModule {
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
    artifacts,
  };
}

function buildFixtureContent(
  programKey: string,
  versionNumber: number,
  versionLabel: string,
  modules: FixtureModule[],
): ToolkitSeedContent {
  return {
    program: {
      programKey,
      programName: `Catalog test program ${programKey}`,
      programDescription: null,
      versionNumber,
      versionLabel,
      versionName: `Fixture ${versionLabel}`,
      versionDescription: null,
      releaseNotes: null,
    },
    modules,
    prompts: [],
    promptBindings: [],
  };
}

// Idempotent, so this never conflicts with a prior `pnpm db:seed` run or
// another test file's own call to the same function — this suite must be
// able to run entirely on its own against a freshly migrated database.
beforeAll(async () => {
  await withTransaction((client) => seedToolkitContent(client));
});

describe("listModuleCatalog", () => {
  it("lists the real V1 catalog in sequence order with the live / coming-soon split", async () => {
    const entries = await listModuleCatalog(founderActor());

    expect(entries.map((entry) => entry.moduleKey)).toEqual([
      "module-00-setup",
      "module-01-pressure-test",
      "module-02-hmw",
      "module-03-icp",
      "module-04-problem-statement",
      "module-05-solution-options",
      "module-06-validation-plan",
    ]);

    expect(
      entries.filter((entry) => entry.catalogStatus === "live").map((entry) => entry.moduleKey),
    ).toEqual(["module-00-setup", "module-01-pressure-test"]);
    expect(entries.filter((entry) => entry.catalogStatus === "coming_soon")).toHaveLength(5);

    const module0 = entries.find((entry) => entry.moduleKey === "module-00-setup")!;
    expect(module0.expectedArtifacts).toEqual([
      {
        artifactKey: "setup_summary",
        name: "Founder Toolkit Setup Summary",
        requiredFilename: "Founder-Toolkit-Setup-Summary.md",
      },
    ]);

    const module1 = entries.find((entry) => entry.moduleKey === "module-01-pressure-test")!;
    expect(module1.expectedArtifacts).toEqual([
      {
        artifactKey: "pressure_test_verdict",
        name: "Pressure-Test Verdict",
        requiredFilename: "Pressure-Test-Verdict.md",
      },
    ]);

    const placeholder = entries.find((entry) => entry.moduleKey === "module-02-hmw")!;
    expect(placeholder.expectedArtifacts).toEqual([]);
  });

  it("returns a DTO with exactly the documented fields, no internal columns leaking", async () => {
    const [entry] = await listModuleCatalog(founderActor());

    expect(Object.keys(entry).sort()).toEqual(
      [
        "moduleKey",
        "sequenceIndex",
        "title",
        "subtitle",
        "description",
        "objective",
        "moduleType",
        "completionMode",
        "estimatedMinutes",
        "catalogStatus",
        "expectedArtifacts",
      ].sort(),
    );
  });

  it("rejects a non-founder actor", async () => {
    await expect(
      listModuleCatalog({ userId: randomUUID(), role: "admin" }),
    ).rejects.toMatchObject({ name: "ServiceError", code: "FORBIDDEN" });
  });

  it("throws NOT_FOUND when no published program_version exists for the given program_key", async () => {
    await expect(
      listModuleCatalog(founderActor(), {
        programKey: `no-such-program-${randomBytes(4).toString("hex")}`,
      }),
    ).rejects.toMatchObject({ name: "ServiceError", code: "NOT_FOUND" });
  });
});

describe("getModuleCatalogEntry", () => {
  it("returns a single Module's catalog entry", async () => {
    const entry = await getModuleCatalogEntry(founderActor(), "module-01-pressure-test");
    expect(entry.title).toBe("Pressure-Test My Idea");
    expect(entry.catalogStatus).toBe("live");
  });

  it("returns NOT_FOUND for an unknown moduleKey", async () => {
    await expect(
      getModuleCatalogEntry(founderActor(), "not-a-real-module"),
    ).rejects.toMatchObject({ name: "ServiceError", code: "NOT_FOUND" });
  });
});

describe("Program isolation, multi-version selection, and Artifact aggregation", () => {
  const RUN_SUFFIX = randomBytes(4).toString("hex");
  const ISOLATION_KEY = `catalog-isolation-test-${RUN_SUFFIX}`;
  const VERSIONING_KEY = `catalog-versioning-test-${RUN_SUFFIX}`;
  const ARTIFACT_KEY = `catalog-artifacts-test-${RUN_SUFFIX}`;

  afterAll(async () => {
    await pool.query("delete from programs where program_key = any($1::text[])", [
      [ISOLATION_KEY, VERSIONING_KEY, ARTIFACT_KEY],
    ]);
  });

  it("only returns Modules for the requested program_key, never another Program's published Modules", async () => {
    const content = buildFixtureContent(ISOLATION_KEY, 1, `v1-${RUN_SUFFIX}`, [
      buildFixtureModule("isolated-fixture-module", 0, [
        buildFixtureArtifact("isolated_artifact", 1, "Isolated Artifact", "isolated.md"),
      ]),
    ]);
    await withTransaction((client) => seedToolkitContent(client, content));

    const fixtureEntries = await listModuleCatalog(founderActor(), {
      programKey: ISOLATION_KEY,
    });
    expect(fixtureEntries.map((entry) => entry.moduleKey)).toEqual([
      "isolated-fixture-module",
    ]);

    const realEntries = await listModuleCatalog(founderActor());
    expect(realEntries.some((entry) => entry.moduleKey === "isolated-fixture-module")).toBe(
      false,
    );
  });

  it("selects the highest version_number when a program_key has more than one published version", async () => {
    const v1Content = buildFixtureContent(VERSIONING_KEY, 1, `v1-${RUN_SUFFIX}`, [
      buildFixtureModule("versioning-fixture-module-a", 0, [
        buildFixtureArtifact("fixture_a_artifact", 1, "Fixture A Artifact", "a.md"),
      ]),
    ]);
    const v2Content = buildFixtureContent(VERSIONING_KEY, 2, `v2-${RUN_SUFFIX}`, [
      buildFixtureModule("versioning-fixture-module-b", 0, [
        buildFixtureArtifact("fixture_b_artifact", 1, "Fixture B Artifact", "b.md"),
      ]),
    ]);

    await withTransaction((client) => seedToolkitContent(client, v1Content));
    await withTransaction((client) => seedToolkitContent(client, v2Content));

    const entries = await listModuleCatalog(founderActor(), { programKey: VERSIONING_KEY });
    expect(entries.map((entry) => entry.moduleKey)).toEqual(["versioning-fixture-module-b"]);
  });

  it("aggregates multiple artifact_definitions into expectedArtifacts without duplicating the Module row", async () => {
    const content = buildFixtureContent(ARTIFACT_KEY, 1, `v1-${RUN_SUFFIX}`, [
      buildFixtureModule("multi-artifact-fixture-module", 0, [
        buildFixtureArtifact("fixture_artifact_one", 1, "Fixture Artifact One", "one.md"),
        buildFixtureArtifact("fixture_artifact_two", 2, "Fixture Artifact Two", "two.md"),
      ]),
    ]);
    await withTransaction((client) => seedToolkitContent(client, content));

    const entries = await listModuleCatalog(founderActor(), { programKey: ARTIFACT_KEY });
    expect(entries).toHaveLength(1);
    expect(entries[0].expectedArtifacts).toEqual([
      { artifactKey: "fixture_artifact_one", name: "Fixture Artifact One", requiredFilename: "one.md" },
      { artifactKey: "fixture_artifact_two", name: "Fixture Artifact Two", requiredFilename: "two.md" },
    ]);
  });
});
