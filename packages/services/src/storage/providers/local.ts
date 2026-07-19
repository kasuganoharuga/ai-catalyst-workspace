import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ServiceError } from "@ai-catalyst/services/errors";
import {
  resolveRealStorageRoot,
  resolveSafeStoragePath,
} from "@ai-catalyst/services/storage/internal/object-key";
import { sha256 } from "@ai-catalyst/services/storage/internal/hash";

import type {
  ProviderObjectMetadata,
  PutObjectInput,
  StorageProvider,
} from "../types.js";

// Resolved from this module's own file location (via `import.meta.url`),
// not `process.cwd()` — same technique as
// packages/toolkit-content/src/paths.ts, and for the same reason: this
// package is consumed as TypeScript source directly (no build step), and
// `process.cwd()` differs between `next dev`, `vitest`, and any future
// CLI, but this file's own location on disk never does.
const currentFileDir = path.dirname(fileURLToPath(import.meta.url));

// Distinguishes the repo root from every other ancestor directory. Chosen
// over a package.json check (every directory up to the OS root has one of
// those) or a `.git` check (not present in every checkout, e.g. some CI
// tarball extractions) — this file only exists once, at the workspace
// root, by construction of the pnpm workspace itself.
const WORKSPACE_ROOT_MARKER = "pnpm-workspace.yaml";

async function findRepoRoot(startDir: string): Promise<string> {
  let dir = startDir;
  for (;;) {
    try {
      await fs.access(path.join(dir, WORKSPACE_ROOT_MARKER));
      return dir;
    } catch {
      const parentDir = path.dirname(dir);
      if (parentDir === dir) {
        throw new Error(
          `Could not locate the repo root (no ${WORKSPACE_ROOT_MARKER} found above ${startDir}).`,
        );
      }
      dir = parentDir;
    }
  }
}

// LOCAL_STORAGE_ROOT if set must resolve to an absolute path — a relative
// value is resolved against the repo root (matching docker-compose.yml's
// override to the absolute in-container /data/storage), never against
// `process.cwd()`. Unset locally defaults to `<repo-root>/.data/storage`.
async function resolveConfiguredRoot(): Promise<string> {
  const configured = process.env.LOCAL_STORAGE_ROOT;
  if (configured && path.isAbsolute(configured)) {
    return configured;
  }

  const repoRoot = await findRepoRoot(currentFileDir);
  return configured
    ? path.join(repoRoot, configured)
    : path.join(repoRoot, ".data", "storage");
}

/**
 * Local-filesystem StorageProvider.
 *
 * `putObject` writes to a unique temp file under the resolved root, then
 * `fsync`s + closes it, then `rename()`s it onto the final key — the
 * entire two-step sequence happens inside this one call; callers never
 * know a temp file was involved (StorageProvider's contract in
 * ../types.js declares this atomicity, it does not expose a separate
 * promote/commit step). A future S3-compatible provider's single PUT is
 * atomic on its own and slots into the same interface unchanged.
 *
 * Acceptance note (see storage/index.ts's top-of-file comment for the
 * full statement): this Provider currently only guarantees
 * single-process/test-suite usability. It does NOT yet provide
 * cross-container (web/mcp) shared local file access under `docker:up` —
 * docker-compose.yml declares a named volume + LOCAL_STORAGE_ROOT
 * convention for it, but nothing has verified concurrent multi-container
 * access actually behaves correctly. That requires either 2.10's move to
 * an S3-compatible provider, or a follow-up PR that actually exercises a
 * shared bind mount across running containers.
 */
export class LocalStorageProvider implements StorageProvider {
  async putObject(input: PutObjectInput): Promise<ProviderObjectMetadata> {
    const realRoot = await resolveRealStorageRoot(await resolveConfiguredRoot());
    const finalPath = await resolveSafeStoragePath(realRoot, input.key, {
      createMissingDirs: true,
    });

    const tempPath = `${finalPath}.tmp-${randomBytes(8).toString("hex")}`;
    const handle = await fs.open(tempPath, "wx");
    try {
      await handle.writeFile(input.body);
      await handle.sync();
    } finally {
      await handle.close();
    }

    try {
      await fs.rename(tempPath, finalPath);
    } catch (error) {
      await fs.rm(tempPath, { force: true });
      throw error;
    }

    return {
      sizeBytes: input.body.byteLength,
      sha256: sha256(input.body),
    };
  }

  async getObject(key: string): Promise<Buffer> {
    const realRoot = await resolveRealStorageRoot(await resolveConfiguredRoot());
    const targetPath = await resolveSafeStoragePath(realRoot, key, {
      createMissingDirs: false,
    });
    return fs.readFile(targetPath);
  }

  async headObject(key: string): Promise<ProviderObjectMetadata | null> {
    const realRoot = await resolveRealStorageRoot(await resolveConfiguredRoot());
    const targetPath = await resolveSafeStoragePath(realRoot, key, {
      createMissingDirs: false,
    });

    let stats;
    try {
      stats = await fs.lstat(targetPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
    if (stats.isSymbolicLink()) {
      throw new ServiceError(
        "VALIDATION_ERROR",
        `Refusing to read through a symlink: ${targetPath}`,
      );
    }

    // The Local Provider has no separate at-rest checksum store (unlike
    // S3's ETag) — the only way to answer "what does this object look
    // like" is to read it back and hash it. Acceptable for V1's
    // single-process/test usage; a real object store keeps this O(1).
    const body = await fs.readFile(targetPath);
    return { sizeBytes: stats.size, sha256: sha256(body) };
  }

  async deleteObject(key: string): Promise<void> {
    const realRoot = await resolveRealStorageRoot(await resolveConfiguredRoot());
    const targetPath = await resolveSafeStoragePath(realRoot, key, {
      createMissingDirs: false,
    });
    await fs.rm(targetPath, { force: true });
  }
}
