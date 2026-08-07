import { promises as fs } from "node:fs";
import path from "node:path";

import { ServiceError } from "@ai-catalyst/services/errors";

// Listed under "./storage/internal/object-key" in package.json so
// Turbopack can resolve this module's cross-directory imports
// (storage/index.ts and storage/providers/local.ts both import this by
// value) — see packages/services/src/internal/branch.ts for why.

const SANITIZE_DISALLOWED_PATTERN = /[^a-zA-Z0-9._-]/g;
const MAX_SANITIZED_FILENAME_LENGTH = 200;
const FALLBACK_FILENAME = "file";

/**
 * Reduces an arbitrary, untrusted caller-supplied filename to a single
 * path-safe segment: allowlisted characters only
 * (`[a-zA-Z0-9._-]`, everything else becomes `-`), path separators
 * neutralized first (so "../../etc/passwd" can never smuggle a `/` or `\`
 * through), no leading dots (no hidden files), bounded length. This alone
 * is not the only defense against path traversal — generateObjectKey
 * below builds the rest of the key from trusted UUIDs, and
 * resolveSafeStoragePath further down adds filesystem-level symlink/
 * escape checks for the Local Provider — but it is what keeps this
 * function's output predictable as a single path segment.
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

// Object Key is always generated here, from trusted components
// (workspaceId/storageObjectId are Service-generated UUIDs, filename is
// sanitized above) — a caller-supplied raw key string is never accepted
// anywhere in the public StorageService API. 2.6 may need to extend this
// path shape once it has Artifact context; this is deliberately not
// exported as part of a versioned/stable path contract yet.
export function generateObjectKey(params: {
  workspaceId: string;
  storageObjectId: string;
  filename: string;
}): string {
  const sanitizedFilename = sanitizeFilename(params.filename);
  return `workspaces/${params.workspaceId}/storage/${params.storageObjectId}/${sanitizedFilename}`;
}

/**
 * Ensures `root` exists and returns its realpath — resolved once by the
 * Local Provider at startup/first use, then passed into
 * resolveSafeStoragePath below for every operation, so a symlink swapped
 * in at the root itself after this call (not defended against — an
 * operator-level trust boundary, not a per-request one) is out of scope,
 * matching the Local Provider's documented single-process/test-suite
 * usability guarantee.
 */
export async function resolveRealStorageRoot(root: string): Promise<string> {
  await fs.mkdir(root, { recursive: true });
  return fs.realpath(root);
}

export interface ResolveSafeStoragePathOptions {
  // Only true for writes (LocalStorageProvider.putObject). When true, any
  // directory segment that doesn't exist yet is created here, directly,
  // with `fs.mkdir` — never left for the caller's own write/rename call
  // to create implicitly. That gap (trusting an already-existing
  // directory tree, or letting a later fs call auto-create through it) is
  // exactly what would let a symlink planted inside an as-yet-uncreated
  // directory hijack the write.
  createMissingDirs: boolean;
}

/**
 * Resolves `objectKey` to an absolute path guaranteed to live inside
 * `realRoot` (already resolved via resolveRealStorageRoot), defending
 * against both simple `../` traversal and a symlink planted inside the
 * root that points outside it.
 *
 * A naive `path.resolve(root, key).startsWith(root)` check catches the
 * former but not the latter: a symlink `root/workspaces/evil -> /etc`
 * still produces a resolved path that starts with `root` textually, even
 * though it points somewhere else entirely once the OS actually follows
 * it. Instead this walks `objectKey` one segment at a time starting from
 * `realRoot`: every segment that already exists must be a real directory
 * (never a symlink) whose own realpath is still inside `realRoot`; the
 * walk stops at the first segment that doesn't exist yet, and (for
 * writes) the remaining segments are created directly by this function.
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
      // A read/delete against an object key whose directory doesn't even
      // exist yet is not a security issue — it just means the object was
      // never written. Build the path anyway and let the caller's own
      // fs call (getObject/headObject/deleteObject) surface the normal
      // "not found" outcome; there is nothing here yet that could be a
      // symlink.
      return path.join(currentDir, ...remainingDirSegments, filename);
    }

    // Nothing below `currentDir` exists yet (the walk above only stops
    // early on the first ENOENT), so this recursive mkdir only ever
    // creates brand-new real directories — there is no pre-existing
    // symlink it could possibly be tricked into following.
    const targetDir = path.join(currentDir, ...remainingDirSegments);
    await fs.mkdir(targetDir, { recursive: true });
    currentDir = await fs.realpath(targetDir);
  }

  const finalPath = path.join(currentDir, filename);

  // The filename itself may already exist (overwrite case) — same
  // symlink check as every directory segment above.
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
