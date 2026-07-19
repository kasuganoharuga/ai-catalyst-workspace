import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { ServiceError } from "@ai-catalyst/services/errors";
import {
  resolveRealStorageRoot,
  resolveSafeStoragePath,
} from "@ai-catalyst/services/storage/internal/object-key";
import { sha256 } from "@ai-catalyst/services/storage/internal/hash";

import type {
  CopyObjectInput,
  DownloadUrl,
  DownloadUrlInput,
  ProviderObjectMetadata,
  PutObjectInput,
  StorageProvider,
} from "../types.js";

export interface LocalStorageProviderOptions {
  /** Absolute path to the on-disk object root. Never read from process.env here. */
  rootDir: string;
}

/**
 * Local-filesystem StorageProvider.
 *
 * `putObject` writes to a unique temp file under the resolved root, then
 * `fsync`s + closes it, then `rename()`s it onto the final key — the
 * entire two-step sequence happens inside this one call; callers never
 * know a temp file was involved.
 *
 * Acceptance note: this Provider currently only guarantees
 * single-process/test-suite usability for concurrent web/mcp access.
 * Cross-container sharing is the job of the S3 provider in cloud envs.
 */
export class LocalStorageProvider implements StorageProvider {
  private readonly rootDir: string;

  constructor(options: LocalStorageProviderOptions) {
    if (!options.rootDir || !path.isAbsolute(options.rootDir)) {
      throw new Error(
        "LocalStorageProvider requires an absolute rootDir (build StorageConfig at the composition root).",
      );
    }
    this.rootDir = options.rootDir;
  }

  private async realRoot(): Promise<string> {
    return resolveRealStorageRoot(this.rootDir);
  }

  async putObject(input: PutObjectInput): Promise<ProviderObjectMetadata> {
    const realRoot = await this.realRoot();
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
    const realRoot = await this.realRoot();
    const targetPath = await resolveSafeStoragePath(realRoot, key, {
      createMissingDirs: false,
    });
    return fs.readFile(targetPath);
  }

  async headObject(key: string): Promise<ProviderObjectMetadata | null> {
    const realRoot = await this.realRoot();
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

    const body = await fs.readFile(targetPath);
    return { sizeBytes: stats.size, sha256: sha256(body) };
  }

  async exists(key: string): Promise<boolean> {
    return (await this.headObject(key)) !== null;
  }

  async deleteObject(key: string): Promise<void> {
    const realRoot = await this.realRoot();
    const targetPath = await resolveSafeStoragePath(realRoot, key, {
      createMissingDirs: false,
    });
    await fs.rm(targetPath, { force: true });
  }

  /**
   * Local escape hatch: a `file://` URL valid until `expiresAt`. Not for
   * browsers in production — Artifact downloads should stream via getObject.
   */
  async createDownloadUrl(input: DownloadUrlInput): Promise<DownloadUrl> {
    if (!(await this.exists(input.key))) {
      throw new ServiceError(
        "NOT_FOUND",
        `No storage object at key "${input.key}".`,
      );
    }
    const realRoot = await this.realRoot();
    const targetPath = await resolveSafeStoragePath(realRoot, input.key, {
      createMissingDirs: false,
    });
    const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000);
    return {
      url: `file://${targetPath.replace(/\\/g, "/")}`,
      expiresAt,
    };
  }

  async copyObject(input: CopyObjectInput): Promise<ProviderObjectMetadata> {
    const body = await this.getObject(input.sourceKey);
    // contentType is not stored separately on disk for local; use octet-stream.
    return this.putObject({
      key: input.destinationKey,
      body,
      contentType: "application/octet-stream",
    });
  }
}
