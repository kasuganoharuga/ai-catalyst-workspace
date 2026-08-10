import { promises as fs } from "node:fs";
import path from "node:path";

import { ServiceError } from "@ai-catalyst/services/errors";

// Path-safe object key generation for storage — listed in package.json for Turbopack resolution.

const SANITIZE_DISALLOWED_PATTERN = /[^a-zA-Z0-9._-]/g;
const MAX_SANITIZED_FILENAME_LENGTH = 200;
const FALLBACK_FILENAME = "file";

/**
 * Sanitises an untrusted filename to one path-safe segment.
 * Allowlisted chars only; separators neutralised first. Complements generateObjectKey and resolveSafeStoragePath.
 */
export function sanitizeFilename(rawFilename: string): string {
  const withoutSeparators = rawFilename.replace(/[\\/]+/g, "-");
  const allowlisted = withoutSeparators.replace(
    SANITIZE_DISALLOWED_PATTERN,
    "-",
  );
  const withoutLeadingDots = allowlisted.replace(/^\.+/, "");
  const truncated = withoutLeadingDots.slice(0, MAX_SANITIZED_FILENAME_LENGTH);
  return truncated.length > 0 ? truncated : FALLBACK_FILENAME;
}

// Built from trusted UUIDs + sanitised filename — caller-supplied raw keys are never accepted.
export function generateObjectKey(params: {
  workspaceId: string;
  storageObjectId: string;
  filename: string;
}): string {
  const sanitizedFilename = sanitizeFilename(params.filename);
  return `workspaces/${params.workspaceId}/storage/${params.storageObjectId}/${sanitizedFilename}`;
}

/** Ensures root exists and returns realpath — resolved once by Local Provider at startup. */
export async function resolveRealStorageRoot(root: string): Promise<string> {
  await fs.mkdir(root, { recursive: true });
  return fs.realpath(root);
}

export interface ResolveSafeStoragePathOptions {
  // Writes only: create missing dirs here so a planted symlink cannot hijack the write.
  createMissingDirs: boolean;
}

/**
 * Resolves objectKey inside realRoot — defends against ../ traversal and symlinks pointing outside.
 * Walks segment-by-segment; existing dirs must be real directories, not symlinks.
 */
export async function resolveSafeStoragePath(
  realRoot: string,
  objectKey: string,
  options: ResolveSafeStoragePathOptions,
): Promise<string> {
  const segments = objectKey.split("/").filter((segment) => segment.length > 0);

  if (
    segments.length === 0 ||
    path.isAbsolute(objectKey) ||
    objectKey.includes("\\") ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      `Refusing to resolve an unsafe object key: ${objectKey}`,
    );
  }

  const dirSegments = segments.slice(0, -1);
  const filename = segments[segments.length - 1];

  let currentDir = realRoot;
  let index = 0;
  for (; index < dirSegments.length; index += 1) {
    const segment = dirSegments[index];
    const candidatePath = path.join(currentDir, segment);

    let stats;
    try {
      stats = await fs.lstat(candidatePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        break;
      }
      throw error;
    }

    if (stats.isSymbolicLink()) {
      throw new ServiceError(
        "VALIDATION_ERROR",
        `Refusing to traverse a symlink inside the storage root: ${candidatePath}`,
      );
    }
    if (!stats.isDirectory()) {
      throw new ServiceError(
        "VALIDATION_ERROR",
        `Expected a directory inside the storage root, found something else: ${candidatePath}`,
      );
    }

    const realCandidate = await fs.realpath(candidatePath);
    const relativeToRoot = path.relative(realRoot, realCandidate);
    if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
      throw new ServiceError(
        "VALIDATION_ERROR",
        `Refusing to traverse outside the storage root: ${candidatePath}`,
      );
    }

    currentDir = realCandidate;
  }

  const remainingDirSegments = dirSegments.slice(index);
  if (remainingDirSegments.length > 0) {
    if (!options.createMissingDirs) {
      // Missing dir on read/delete — let caller surface normal "not found".
      return path.join(currentDir, ...remainingDirSegments, filename);
    }

    // mkdir only creates new real directories below currentDir — no pre-existing symlinks to follow.
    const targetDir = path.join(currentDir, ...remainingDirSegments);
    await fs.mkdir(targetDir, { recursive: true });
    currentDir = await fs.realpath(targetDir);
  }

  const finalPath = path.join(currentDir, filename);

  // Filename may exist on overwrite — same symlink check as directory segments.
  let finalStats;
  try {
    finalStats = await fs.lstat(finalPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return finalPath;
    }
    throw error;
  }
  if (finalStats.isSymbolicLink()) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      `Refusing to operate through a symlink: ${finalPath}`,
    );
  }

  return finalPath;
}
