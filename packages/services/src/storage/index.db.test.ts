import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pool } from "@ai-catalyst/db";
import type { ActorContext } from "@ai-catalyst/contracts/actor-context";

import {
  resolveRealStorageRoot,
  resolveSafeStoragePath,
  sanitizeFilename,
} from "@ai-catalyst/services/storage/internal/object-key";
import { sha256 } from "@ai-catalyst/services/storage/internal/hash";
import { MAX_GENERATED_TEXT_BYTES } from "@ai-catalyst/services/storage/internal/validation";
import { LocalStorageProvider } from "@ai-catalyst/services/storage/providers/local";
import { createFixtureFounderAccount } from "@ai-catalyst/services/testing/db-fixtures";

import {
  createPendingGeneratedObject,
  deleteUnverifiedUpload,
  getStorageObject,
  writeGeneratedTextContent,
} from "./index.js";
import type { StorageProvider } from "./types.js";

/**
 * Integration tests against the real Postgres database, following the
 * same pattern as packages/services/src/venture/index.db.test.ts. All
 * filesystem operations run against an isolated `fs.mkdtemp` root (never
 * the real `.data/storage`), so this suite is safe to run alongside other
 * work sharing the same Postgres instance and never touches real files.
 */
describe("storage service — database integration", () => {
  const emailPrefix = `storage-test-${randomUUID()}`;
  const createdUserIds: string[] = [];
  let storageRoot: string;
  let originalLocalStorageRoot: string | undefined;

  async function createFounderWithWorkspace(
    label: string,
  ): Promise<{ actor: ActorContext; workspaceId: string }> {
    const { userId, workspaceId } = await createFixtureFounderAccount({
      label,
      emailPrefix,
      slugPrefix: "storage-service",
    });
    createdUserIds.push(userId);

    return { actor: { userId, role: "founder" }, workspaceId };
  }

  async function getRawRow(id: string): Promise<{
    upload_status: string;
    checksum_sha256: string | null;
    deleted_at: Date | null;
  } | null> {
    const result = await pool.query<{
      upload_status: string;
      checksum_sha256: string | null;
      deleted_at: Date | null;
    }>(
      "select upload_status, checksum_sha256, deleted_at from storage_objects where id = $1",
      [id],
    );
    return result.rows[0] ?? null;
  }

  beforeAll(async () => {
    storageRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "ai-catalyst-storage-"),
    );
    originalLocalStorageRoot = process.env.LOCAL_STORAGE_ROOT;
    process.env.LOCAL_STORAGE_ROOT = storageRoot;
  });

  afterAll(async () => {
    if (originalLocalStorageRoot === undefined) {
      delete process.env.LOCAL_STORAGE_ROOT;
    } else {
      process.env.LOCAL_STORAGE_ROOT = originalLocalStorageRoot;
    }
    await fs.rm(storageRoot, { recursive: true, force: true });

    await pool.query(
      "delete from storage_objects where workspace_id in (select id from workspaces where founder_user_id = any($1::uuid[]))",
      [createdUserIds],
    );
    await pool.query(
      "delete from workspaces where founder_user_id = any($1::uuid[])",
      [createdUserIds],
    );
    await pool.query("delete from users where id = any($1::uuid[])", [
      createdUserIds,
    ]);
  });

  describe("sanitizeFilename", () => {
    it("neutralizes POSIX-style path traversal", () => {
      const result = sanitizeFilename("../../etc/passwd");
      expect(result).not.toMatch(/[\\/]/);
      expect(result).not.toMatch(/^\./);
    });

    it("neutralizes Windows-style path traversal", () => {
      const result = sanitizeFilename("..\\..\\windows");
      expect(result).not.toMatch(/[\\/]/);
    });

    it("truncates an excessively long filename", () => {
      const result = sanitizeFilename("a".repeat(500));
      expect(result.length).toBeLessThanOrEqual(200);
    });

    it("strips leading dots so hidden files can't be created", () => {
      expect(sanitizeFilename(".hidden")).toBe("hidden");
    });

    it("allowlists characters, replacing everything else with a dash", () => {
      const result = sanitizeFilename("file name with spaces & (parens).md");
      expect(result).toMatch(/^[a-zA-Z0-9._-]+$/);
    });

    it("falls back to a default name when nothing sanitizable remains", () => {
      // An all-dots filename allowlists cleanly (dots are allowed) but
      // then gets fully consumed by the leading-dot strip, leaving
      // nothing — the fallback kicks in rather than returning "".
      expect(sanitizeFilename("...")).toBe("file");
    });
  });

  describe("Local Provider path/symlink defense", () => {
    it("rejects an object key containing '..' segments", async () => {
      const realRoot = await resolveRealStorageRoot(storageRoot);
      await expect(
        resolveSafeStoragePath(realRoot, "../outside/escape.md", {
          createMissingDirs: false,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("rejects an absolute-path object key", async () => {
      const realRoot = await resolveRealStorageRoot(storageRoot);
      await expect(
        resolveSafeStoragePath(realRoot, "/etc/passwd", {
          createMissingDirs: false,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("rejects a real write through a symlink planted inside the storage root pointing outside it", async () => {
      const realRoot = await resolveRealStorageRoot(storageRoot);
      const outsideDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "ai-catalyst-storage-outside-"),
      );
      const linkPath = path.join(realRoot, "escape-link");
      // "junction" (rather than a plain directory symlink) so this test
      // doesn't require Administrator/Developer Mode privileges on
      // Windows — resolveSafeStoragePath's realpath-containment check
      // (not just the isSymbolicLink() flag) is what actually rejects
      // this, so it catches a junction the same way it would a symlink.
      await fs.symlink(outsideDir, linkPath, "junction");

      const provider = new LocalStorageProvider({ rootDir: storageRoot });
      await expect(
        provider.putObject({
          key: "escape-link/payload.md",
          body: Buffer.from("malicious", "utf8"),
          contentType: "text/plain",
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

      const escapedFileExists = await fs
        .access(path.join(outsideDir, "payload.md"))
        .then(() => true)
        .catch(() => false);
      expect(escapedFileExists).toBe(false);

      await fs.rm(outsideDir, { recursive: true, force: true });
    });
  });

  describe("createPendingGeneratedObject / writeGeneratedTextContent", () => {
    it("computes correct size/hash for multi-byte UTF-8 content and reaches verified", async () => {
      const { actor, workspaceId } = await createFounderWithWorkspace("utf8");
      const pending = await createPendingGeneratedObject(actor, {
        workspaceId,
        filename: "unicode.md",
      });
      const content = "Hello 世界 🚀 — multi-byte test.";
      const expectedBuffer = Buffer.from(content, "utf8");

      const result = await writeGeneratedTextContent(actor, {
        storageObjectId: pending.id,
        content,
      });

      expect(result.uploadStatus).toBe("verified");
      expect(result.sizeBytes).toBe(expectedBuffer.byteLength);
      expect(result.sizeBytes).not.toBe(content.length);
      expect(result.sha256).toBe(sha256(expectedBuffer));
      expect(result.contentType).toBe("text/markdown; charset=utf-8");
      expect(result.verifiedAt).not.toBeNull();
    });

    it("rejects content over the byte limit before touching the pending row", async () => {
      const { actor, workspaceId } =
        await createFounderWithWorkspace("oversized");
      const pending = await createPendingGeneratedObject(actor, {
        workspaceId,
        filename: "big.md",
      });
      const oversized = "a".repeat(MAX_GENERATED_TEXT_BYTES + 1);

      await expect(
        writeGeneratedTextContent(actor, {
          storageObjectId: pending.id,
          content: oversized,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

      const row = await getRawRow(pending.id);
      expect(row).not.toBeNull();
      expect(row?.upload_status).toBe("pending");
      expect(row?.checksum_sha256).toBeNull();
    });

    it("is idempotent when retried with identical content for the same storageObjectId", async () => {
      const { actor, workspaceId } =
        await createFounderWithWorkspace("idempotent");
      const pending = await createPendingGeneratedObject(actor, {
        workspaceId,
        filename: "same.md",
      });
      const content = "Same content twice.";

      const first = await writeGeneratedTextContent(actor, {
        storageObjectId: pending.id,
        content,
      });
      const second = await writeGeneratedTextContent(actor, {
        storageObjectId: pending.id,
        content,
      });

      expect(second.uploadStatus).toBe("verified");
      expect(second.verifiedAt).toBe(first.verifiedAt);
      expect(second.sha256).toBe(first.sha256);
    });

    it("rejects a different content hash for the same storageObjectId with STORAGE_CONTENT_CONFLICT", async () => {
      const { actor, workspaceId } =
        await createFounderWithWorkspace("conflict");
      const pending = await createPendingGeneratedObject(actor, {
        workspaceId,
        filename: "conflict.md",
      });
      await writeGeneratedTextContent(actor, {
        storageObjectId: pending.id,
        content: "Version A",
      });

      await expect(
        writeGeneratedTextContent(actor, {
          storageObjectId: pending.id,
          content: "Version B",
        }),
      ).rejects.toMatchObject({ code: "STORAGE_CONTENT_CONFLICT" });
    });

    it("rejects retrying a failed or deleted row with STORAGE_OBJECT_NOT_WRITABLE", async () => {
      const { actor, workspaceId } =
        await createFounderWithWorkspace("dead-row");

      const failedPending = await createPendingGeneratedObject(actor, {
        workspaceId,
        filename: "failed.md",
      });
      await pool.query(
        "update storage_objects set upload_status = 'failed' where id = $1",
        [failedPending.id],
      );
      await expect(
        writeGeneratedTextContent(actor, {
          storageObjectId: failedPending.id,
          content: "x",
        }),
      ).rejects.toMatchObject({ code: "STORAGE_OBJECT_NOT_WRITABLE" });

      const deletedPending = await createPendingGeneratedObject(actor, {
        workspaceId,
        filename: "deleted.md",
      });
      await pool.query(
        "update storage_objects set upload_status = 'deleted', deleted_at = now() where id = $1",
        [deletedPending.id],
      );
      await expect(
        writeGeneratedTextContent(actor, {
          storageObjectId: deletedPending.id,
          content: "x",
        }),
      ).rejects.toMatchObject({ code: "STORAGE_OBJECT_NOT_WRITABLE" });
    });

    it("recovers an orphaned provider object on retry without re-writing it", async () => {
      const { actor, workspaceId } =
        await createFounderWithWorkspace("orphan-recovery");

      let putCalls = 0;
      const delegate = new LocalStorageProvider({ rootDir: storageRoot });
      const countingProvider: StorageProvider = {
        putObject: async (writeInput) => {
          putCalls += 1;
          return delegate.putObject(writeInput);
        },
        getObject: (key) => delegate.getObject(key),
        headObject: (key) => delegate.headObject(key),
        exists: (key) => delegate.exists(key),
        deleteObject: (key) => delegate.deleteObject(key),
        createDownloadUrl: (input) => delegate.createDownloadUrl(input),
        copyObject: (input) => delegate.copyObject(input),
      };

      const pending = await createPendingGeneratedObject(actor, {
        workspaceId,
        filename: "orphan.md",
      });
      const content = "Orphan recovery content.";

      const verified = await writeGeneratedTextContent(
        actor,
        { storageObjectId: pending.id, content },
        { provider: countingProvider },
      );
      expect(verified.uploadStatus).toBe("verified");
      expect(putCalls).toBe(1);

      // Simulate provider write succeeding while the DB update never
      // committed: row reset to pending, bytes still on disk.
      await pool.query(
        `update storage_objects
         set upload_status = 'pending', checksum_sha256 = null,
             size_bytes = null, uploaded_at = null, verified_at = null
         where id = $1`,
        [pending.id],
      );

      const recovered = await writeGeneratedTextContent(
        actor,
        { storageObjectId: pending.id, content },
        { provider: countingProvider },
      );

      expect(recovered.uploadStatus).toBe("verified");
      expect(recovered.sha256).toBe(sha256(Buffer.from(content, "utf8")));
      // The orphaned object was detected via headObject (same hash) —
      // putObject was never called a second time.
      expect(putCalls).toBe(1);
    });

    it("marks the row failed and never reaches verified when the provider object never becomes visible", async () => {
      const { actor, workspaceId } =
        await createFounderWithWorkspace("missing-object");
      const pending = await createPendingGeneratedObject(actor, {
        workspaceId,
        filename: "missing.md",
      });

      // A Provider that "succeeds" at putObject but never actually makes
      // the object visible via headObject — models the case where the
      // post-write verification step (transaction B → Provider I/O →
      // transaction C) discovers the bytes never really landed.
      const neverVisibleProvider: StorageProvider = {
        putObject: async (writeInput) => ({
          sizeBytes: writeInput.body.byteLength,
          sha256: sha256(writeInput.body),
        }),
        getObject: async () => {
          throw new Error("object not found");
        },
        headObject: async () => null,
        exists: async () => false,
        deleteObject: async () => undefined,
        createDownloadUrl: async () => {
          throw new Error("not found");
        },
        copyObject: async () => {
          throw new Error("not found");
        },
      };

      await expect(
        writeGeneratedTextContent(
          actor,
          { storageObjectId: pending.id, content: "hello" },
          { provider: neverVisibleProvider },
        ),
      ).rejects.toMatchObject({ code: "STORAGE_OBJECT_NOT_WRITABLE" });

      const row = await getRawRow(pending.id);
      expect(row?.upload_status).toBe("failed");
    });

    it("returns NOT_FOUND for a storageObjectId belonging to another workspace", async () => {
      const { actor: ownerActor, workspaceId } =
        await createFounderWithWorkspace("cross-owner");
      const { actor: otherActor } =
        await createFounderWithWorkspace("cross-other");
      const pending = await createPendingGeneratedObject(ownerActor, {
        workspaceId,
        filename: "mine.md",
      });

      await expect(
        getStorageObject(otherActor, pending.id),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        writeGeneratedTextContent(otherActor, {
          storageObjectId: pending.id,
          content: "x",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        deleteUnverifiedUpload(otherActor, { storageObjectId: pending.id }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("rejects createPendingGeneratedObject for a workspaceId the Founder cannot reach", async () => {
      const { actor } = await createFounderWithWorkspace("cross-create");
      const { workspaceId: otherWorkspaceId } =
        await createFounderWithWorkspace("cross-create-other");

      await expect(
        createPendingGeneratedObject(actor, {
          workspaceId: otherWorkspaceId,
          filename: "x.md",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("rejects an actor role that is neither founder nor system-sourced", async () => {
      const mentor: ActorContext = { userId: randomUUID(), role: "mentor" };
      await expect(
        createPendingGeneratedObject(mentor, {
          workspaceId: randomUUID(),
          filename: "x.md",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("lets a system-sourced actor target an explicit workspaceId directly", async () => {
      const { workspaceId } = await createFounderWithWorkspace("system-actor");
      const systemActor: ActorContext = {
        userId: randomUUID(),
        role: "admin",
        source: "system",
      };

      const pending = await createPendingGeneratedObject(systemActor, {
        workspaceId,
        filename: "system.md",
      });

      const created = await getStorageObject(systemActor, pending.id);
      expect(created.workspaceId).toBe(workspaceId);
    });
  });

  describe("deleteUnverifiedUpload", () => {
    it("rejects deleting a verified object with STORAGE_OBJECT_NOT_DELETABLE", async () => {
      const { actor, workspaceId } =
        await createFounderWithWorkspace("delete-verified");
      const pending = await createPendingGeneratedObject(actor, {
        workspaceId,
        filename: "verified.md",
      });
      await writeGeneratedTextContent(actor, {
        storageObjectId: pending.id,
        content: "done",
      });

      await expect(
        deleteUnverifiedUpload(actor, { storageObjectId: pending.id }),
      ).rejects.toMatchObject({ code: "STORAGE_OBJECT_NOT_DELETABLE" });
    });

    it("soft-deletes a pending upload, keeping the row in the database", async () => {
      const { actor, workspaceId } =
        await createFounderWithWorkspace("delete-soft");
      const pending = await createPendingGeneratedObject(actor, {
        workspaceId,
        filename: "unfinished.md",
      });

      const deleted = await deleteUnverifiedUpload(actor, {
        storageObjectId: pending.id,
      });

      expect(deleted.uploadStatus).toBe("deleted");
      expect(deleted.deletedAt).not.toBeNull();

      const row = await getRawRow(pending.id);
      expect(row).not.toBeNull();
      expect(row?.upload_status).toBe("deleted");
    });

    it("is idempotent when the object is already deleted, without touching deletedAt", async () => {
      const { actor, workspaceId } =
        await createFounderWithWorkspace("delete-idempotent");
      const pending = await createPendingGeneratedObject(actor, {
        workspaceId,
        filename: "unfinished-again.md",
      });

      const firstDelete = await deleteUnverifiedUpload(actor, {
        storageObjectId: pending.id,
      });
      const secondDelete = await deleteUnverifiedUpload(actor, {
        storageObjectId: pending.id,
      });

      expect(secondDelete.uploadStatus).toBe("deleted");
      expect(secondDelete.deletedAt).toBe(firstDelete.deletedAt);
    });
  });
});
