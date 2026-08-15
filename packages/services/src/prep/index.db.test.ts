import { randomBytes, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import type { ToolkitSeedContent } from "@ai-catalyst/services/content-seed";
import { getModuleContext } from "@ai-catalyst/services/module/context";
import { getOrCreateProgramRun } from "@ai-catalyst/services/workflow";
import { setActiveVenture } from "@ai-catalyst/services/workspace/active-context";
import {
  cleanupFixtureAccounts,
  createFixtureFounderAccount,
  createFixtureVenture,
  seedFixtureProgram,
} from "@ai-catalyst/services/testing/db-fixtures";

import {
  MAX_PREP_DOCUMENTS_PER_MODULE,
  getConfirmedInterviewCount,
  listPrepDocuments,
  readPrepDocument,
  savePrepExtract,
  uploadPrepDocument,
  withdrawPrepDocument,
} from "./index.js";

/**
 * Integration tests against the real Postgres database. Filesystem writes
 * go to an isolated `fs.mkdtemp` root, never the real `.data/storage`, so
 * this suite is safe to run alongside other work on the same instance.
 */
describe("module prep documents — database integration", () => {
  const RUN_SUFFIX = randomBytes(4).toString("hex");
  const emailPrefix = `prep-test-${RUN_SUFFIX}`;
  const PROGRAM_KEY = `prep-service-${RUN_SUFFIX}`;
  const MODULE_KEY = "prep-module-01";
  const createdUserIds: string[] = [];

  let storageRoot: string;
  let originalLocalStorageRoot: string | undefined;

  function founder(userId: string): ActorContext {
    return { userId, role: "founder", source: "web" };
  }

  const fixtureModule: ToolkitSeedContent["modules"][number] = {
    moduleKey: MODULE_KEY,
    sequenceIndex: 0,
    title: "Fixture prep module",
    subtitle: null,
    description: null,
    objective: null,
    moduleType: "standard",
    isRequired: true,
    allowRevisions: true,
    completionMode: "artifact_and_confirmation",
    estimatedMinutes: null,
    isPublishable: true,
    // A publishable module needs at least one question or artifact.
    questions: [
      {
        questionKey: "prep_fixture_question",
        sequenceIndex: 1,
        questionGroup: null,
        questionText: "Fixture question for a publishable prep module.",
        helpText: null,
        placeholderText: null,
        responseType: "long_text",
        isRequired: false,
        allowSkip: true,
        options: [],
        conditions: {},
      },
    ],
    artifacts: [],
  };

  async function newRunModule(label: string): Promise<{
    actor: ActorContext;
    programRunModuleId: string;
    ventureId: string;
  }> {
    const { userId, workspaceId } = await createFixtureFounderAccount({
      label,
      emailPrefix,
      slugPrefix: "prep-service",
    });
    createdUserIds.push(userId);
    const ventureId = await createFixtureVenture({
      workspaceId,
      createdByUserId: userId,
      label,
      slugPrefix: "prep-service-venture",
    });
    const actor = founder(userId);
    const { run } = await getOrCreateProgramRun(
      actor,
      { ventureId },
      { programKey: PROGRAM_KEY },
    );
    const modules = await pool.query<{ id: string }>(
      `select id from program_run_modules
       where program_run_id = $1 and module_key = $2`,
      [run.id, MODULE_KEY],
    );
    return { actor, programRunModuleId: modules.rows[0].id, ventureId };
  }

  beforeAll(async () => {
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-catalyst-prep-"));
    originalLocalStorageRoot = process.env.LOCAL_STORAGE_ROOT;
    process.env.LOCAL_STORAGE_ROOT = storageRoot;

    await seedFixtureProgram({
      program: {
        programKey: PROGRAM_KEY,
        programName: `Prep service test ${PROGRAM_KEY}`,
        programDescription: null,
        versionNumber: 1,
        versionLabel: `v1-${PROGRAM_KEY}`,
        versionName: `Fixture v1 ${PROGRAM_KEY}`,
        versionDescription: null,
        contentLock: "frozen",
        releaseNotes: null,
      },
      modules: [fixtureModule],
      prompts: [],
      promptBindings: [],
    });
  });

  afterAll(async () => {
    await pool.query(
      `delete from module_prep_documents
       where workspace_id in (
         select id from workspaces where founder_user_id = any($1::uuid[])
       )`,
      [createdUserIds],
    );
    await cleanupFixtureAccounts({
      userIds: createdUserIds,
      programKey: PROGRAM_KEY,
    });
    if (originalLocalStorageRoot === undefined) {
      delete process.env.LOCAL_STORAGE_ROOT;
    } else {
      process.env.LOCAL_STORAGE_ROOT = originalLocalStorageRoot;
    }
    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  it("stores an upload and returns it verbatim, with no extracted text", async () => {
    const { actor, programRunModuleId } = await newRunModule("roundtrip");
    const body = Buffer.from("# Interview 1\n\nThey pay $400/month.\n", "utf8");

    const saved = await uploadPrepDocument(actor, {
      programRunModuleId,
      filename: "interview-1.md",
      contentType: "text/markdown",
      content: body,
      note: "ran long",
    });

    expect(saved.filename).toBe("interview-1.md");
    expect(saved.contentType).toBe("text/markdown");
    expect(saved.sizeBytes).toBe(body.byteLength);
    expect(saved.note).toBe("ran long");

    // The bytes come back exactly as uploaded — the whole point of
    // file-only storage is that nothing rewrites the Founder's material.
    const { content } = await readPrepDocument(actor, saved.id);
    expect(content).not.toBeNull();
    expect(content?.equals(body)).toBe(true);
  });

  it("saves an assistant-transcribed extract with no storage object", async () => {
    const { actor, programRunModuleId } = await newRunModule("extract");

    const saved = await savePrepExtract(actor, {
      programRunModuleId,
      filename: "pitch-deck.pdf",
      extractedText:
        "They pay $400/month. Six interviews, all ANZ accounting firms.",
      note: "shared directly in chat",
      documentKind: "other",
    });

    expect(saved.filename).toBe("pitch-deck.pdf");
    expect(saved.storageObjectId).toBeNull();
    expect(saved.extractedText).toBe(
      "They pay $400/month. Six interviews, all ANZ accounting firms.",
    );
    expect(saved.sizeBytes).toBeNull();
    expect(saved.note).toBe("shared directly in chat");
    expect(saved.documentKind).toBe("other");
    expect(saved.interviewCount).toBeNull();

    // No storage object to read — the saved text is the only content.
    const { document, content } = await readPrepDocument(actor, saved.id);
    expect(content).toBeNull();
    expect(document.extractedText).toBe(saved.extractedText);
  });

  it("rejects an empty extract", async () => {
    const { actor, programRunModuleId } = await newRunModule("empty-extract");
    await expect(
      savePrepExtract(actor, {
        programRunModuleId,
        filename: "notes.txt",
        extractedText: "   ",
        documentKind: "other",
      }),
    ).rejects.toThrow(/must not be empty/);
  });

  it("lists an uploaded file and a saved extract side by side", async () => {
    const { actor, programRunModuleId } = await newRunModule("mixed");
    const uploaded = await uploadPrepDocument(actor, {
      programRunModuleId,
      filename: "keep.txt",
      contentType: "text/plain",
      content: Buffer.from("keep", "utf8"),
    });
    const extracted = await savePrepExtract(actor, {
      programRunModuleId,
      filename: "shared-in-chat.pdf",
      extractedText: "Transcribed from the Founder's deck.",
      documentKind: "other",
    });

    const documents = await listPrepDocuments(actor, programRunModuleId);
    expect(documents.map((d) => d.id).sort()).toEqual(
      [uploaded.id, extracted.id].sort(),
    );
    const extractRow = documents.find((d) => d.id === extracted.id)!;
    expect(extractRow.storageObjectId).toBeNull();
    expect(extractRow.extractedText).toBe(
      "Transcribed from the Founder's deck.",
    );
  });

  it("counts a saved extract toward the per-module cap", async () => {
    const { actor, programRunModuleId } = await newRunModule("extract-cap");
    for (let i = 0; i < MAX_PREP_DOCUMENTS_PER_MODULE; i += 1) {
      await savePrepExtract(actor, {
        programRunModuleId,
        filename: `note-${i}.txt`,
        extractedText: `transcribed note ${i}`,
        documentKind: "other",
      });
    }

    await expect(
      savePrepExtract(actor, {
        programRunModuleId,
        filename: "one-too-many.txt",
        extractedText: "nope",
        documentKind: "other",
      }),
    ).rejects.toThrow(/already has/);
  });

  it("lists only live documents and hides withdrawn ones", async () => {
    const { actor, programRunModuleId } = await newRunModule("withdraw");
    const first = await uploadPrepDocument(actor, {
      programRunModuleId,
      filename: "keep.txt",
      contentType: "text/plain",
      content: Buffer.from("keep", "utf8"),
    });
    const second = await uploadPrepDocument(actor, {
      programRunModuleId,
      filename: "drop.txt",
      contentType: "text/plain",
      content: Buffer.from("drop", "utf8"),
    });

    expect((await listPrepDocuments(actor, programRunModuleId)).length).toBe(2);

    await withdrawPrepDocument(actor, second.id);

    const remaining = await listPrepDocuments(actor, programRunModuleId);
    expect(remaining.map((d) => d.id)).toEqual([first.id]);

    // Soft withdrawal: the row survives so an attempt that already read
    // the file still has an accurate record of what was visible.
    const raw = await pool.query<{ withdrawn_at: Date | null }>(
      "select withdrawn_at from module_prep_documents where id = $1",
      [second.id],
    );
    expect(raw.rows[0].withdrawn_at).not.toBeNull();
  });

  it("rejects a file type that is not on the allowlist", async () => {
    const { actor, programRunModuleId } = await newRunModule("badtype");
    await expect(
      uploadPrepDocument(actor, {
        programRunModuleId,
        filename: "payload.exe",
        contentType: "application/x-msdownload",
        content: Buffer.from("MZ", "utf8"),
      }),
    ).rejects.toThrow(/cannot be uploaded as prep material/);
  });

  it("rejects images, which no reader could extract text from", async () => {
    const { actor, programRunModuleId } = await newRunModule("image");
    // A screenshot of interview notes would upload cleanly and then come
    // back readable:false from get_prep_document, leaving the Founder
    // believing they had handed over evidence nothing can use.
    for (const [filename, contentType] of [
      ["notes.png", "image/png"],
      ["whiteboard.jpg", "image/jpeg"],
    ]) {
      await expect(
        uploadPrepDocument(actor, {
          programRunModuleId,
          filename,
          contentType,
          content: Buffer.from("\x89PNG\r\n\x1a\n", "binary"),
        }),
      ).rejects.toThrow(/cannot be uploaded as prep material/);
    }
  });

  it("accepts .md when the browser sends no content type", async () => {
    const { actor, programRunModuleId } = await newRunModule("emptytype");
    const saved = await uploadPrepDocument(actor, {
      programRunModuleId,
      filename: "notes.md",
      contentType: "",
      content: Buffer.from("# notes", "utf8"),
    });
    expect(saved.contentType).toBe("text/markdown");
  });

  it("rejects an empty file rather than storing a zero-byte object", async () => {
    const { actor, programRunModuleId } = await newRunModule("empty");
    await expect(
      uploadPrepDocument(actor, {
        programRunModuleId,
        filename: "empty.txt",
        contentType: "text/plain",
        content: Buffer.alloc(0),
      }),
    ).rejects.toThrow(/empty/);
  });

  it("caps the number of live documents per module", async () => {
    const { actor, programRunModuleId } = await newRunModule("cap");
    for (let i = 0; i < MAX_PREP_DOCUMENTS_PER_MODULE; i += 1) {
      await uploadPrepDocument(actor, {
        programRunModuleId,
        filename: `note-${i}.txt`,
        contentType: "text/plain",
        content: Buffer.from(`note ${i}`, "utf8"),
      });
    }

    await expect(
      uploadPrepDocument(actor, {
        programRunModuleId,
        filename: "one-too-many.txt",
        contentType: "text/plain",
        content: Buffer.from("nope", "utf8"),
      }),
    ).rejects.toThrow(/already has/);
  });

  it("never exposes another workspace's documents", async () => {
    const owner = await newRunModule("owner");
    const intruder = await newRunModule("intruder");

    const saved = await uploadPrepDocument(owner.actor, {
      programRunModuleId: owner.programRunModuleId,
      filename: "private.md",
      contentType: "text/markdown",
      content: Buffer.from("private", "utf8"),
    });

    // Same "not found" for a foreign row as for a missing one — never
    // confirm existence across a tenant boundary.
    await expect(
      listPrepDocuments(intruder.actor, owner.programRunModuleId),
    ).rejects.toThrow(/Module not found/);
    await expect(readPrepDocument(intruder.actor, saved.id)).rejects.toThrow(
      /Document not found/,
    );
    await expect(
      withdrawPrepDocument(intruder.actor, saved.id),
    ).rejects.toThrow(/Document not found/);
  });

  it("surfaces uploads through get_module_context, metadata only", async () => {
    const { actor, programRunModuleId, ventureId } =
      await newRunModule("context");
    await setActiveVenture(actor, ventureId);

    const saved = await uploadPrepDocument(actor, {
      programRunModuleId,
      filename: "prep.md",
      contentType: "text/markdown",
      content: Buffer.from("# prep notes", "utf8"),
    });

    const context = await getModuleContext(actor, { moduleKey: MODULE_KEY });

    expect(context.prepDocuments).toHaveLength(1);
    expect(context.prepDocuments[0]).toMatchObject({
      id: saved.id,
      filename: "prep.md",
      contentType: "text/markdown",
    });
    // Bytes are never inlined into Module context — the reader fetches
    // only the files it decides to open.
    expect(context.prepDocuments[0]).not.toHaveProperty("content");

    // Withdrawing removes it from what the assistant is told about.
    await withdrawPrepDocument(actor, saved.id);
    const after = await getModuleContext(actor, { moduleKey: MODULE_KEY });
    expect(after.prepDocuments).toHaveLength(0);
  });

  it("surfaces a saved extract through get_module_context — a plain inner join would silently hide it", async () => {
    const { actor, programRunModuleId, ventureId } =
      await newRunModule("context-extract");
    await setActiveVenture(actor, ventureId);

    const saved = await savePrepExtract(actor, {
      programRunModuleId,
      filename: "shared-in-chat.pdf",
      extractedText: "Extracted from the Founder's deck.",
      documentKind: "other",
    });

    const context = await getModuleContext(actor, { moduleKey: MODULE_KEY });

    expect(context.prepDocuments).toHaveLength(1);
    expect(context.prepDocuments[0]).toMatchObject({
      id: saved.id,
      filename: "shared-in-chat.pdf",
    });
  });

  it("rejects a chat extract that omits documentKind instead of defaulting to other", async () => {
    const { actor, programRunModuleId } = await newRunModule("kind-required");
    await expect(
      savePrepExtract(actor, {
        programRunModuleId,
        filename: "notes.txt",
        extractedText: "A customer interview.",
      } as never),
    ).rejects.toThrow(/documentKind is required/);
  });

  it("counts interview_transcript extracts toward the confirmed-interview floor and ignores other", async () => {
    const { actor, programRunModuleId } = await newRunModule("kind-count");

    const transcript = await savePrepExtract(actor, {
      programRunModuleId,
      filename: "three-interviews.md",
      extractedText: "Three distinct conversations in one paste.",
      documentKind: "interview_transcript",
      interviewCount: 3,
    });
    expect(transcript.documentKind).toBe("interview_transcript");
    expect(transcript.interviewCount).toBe(3);
    expect(await getConfirmedInterviewCount(actor, programRunModuleId)).toBe(3);

    await savePrepExtract(actor, {
      programRunModuleId,
      filename: "pitch-deck.pdf",
      extractedText: "A deck, not an interview.",
      documentKind: "other",
    });
    expect(await getConfirmedInterviewCount(actor, programRunModuleId)).toBe(3);
  });

  it("rejects interview_transcript without interviewCount, and other with a count", async () => {
    const { actor, programRunModuleId } = await newRunModule("kind-xor");
    await expect(
      savePrepExtract(actor, {
        programRunModuleId,
        filename: "interview.md",
        extractedText: "One conversation.",
        documentKind: "interview_transcript",
      }),
    ).rejects.toThrow(/interviewCount must be a positive integer/);
    await expect(
      savePrepExtract(actor, {
        programRunModuleId,
        filename: "notes.md",
        extractedText: "Research notes.",
        documentKind: "other",
        interviewCount: 1,
      }),
    ).rejects.toThrow(/interviewCount may only be set/);
  });

  it("treats an unknown run module id as not found", async () => {
    const { actor } = await newRunModule("missing");
    await expect(listPrepDocuments(actor, randomUUID())).rejects.toThrow(
      /Module not found/,
    );
  });
});
