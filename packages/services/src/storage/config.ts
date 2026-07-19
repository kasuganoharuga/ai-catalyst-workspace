import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Provider-agnostic storage configuration. Built at the composition root
 * (env / test fixtures); StorageProvider implementations never read
 * `process.env` themselves.
 */
export type StorageConfig =
  | { kind: "local"; rootDir: string }
  | {
      kind: "s3";
      bucket: string;
      region: string;
      /** Optional custom endpoint (LocalStack / MinIO). */
      endpoint?: string;
    };

const currentFileDir = path.dirname(fileURLToPath(import.meta.url));
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

/**
 * Resolve a local storage root directory. Relative paths are resolved
 * against the repo root (never `process.cwd()`), matching docker-compose's
 * absolute `/data/storage` convention for containers.
 */
export async function resolveLocalStorageRoot(
  configured: string | undefined,
): Promise<string> {
  if (configured && path.isAbsolute(configured)) {
    return configured;
  }

  const repoRoot = await findRepoRoot(currentFileDir);
  return configured
    ? path.join(repoRoot, configured)
    : path.join(repoRoot, ".data", "storage");
}

/**
 * Build StorageConfig from environment variables. Call only from
 * composition roots / tests — not from inside a StorageProvider.
 *
 * - `STORAGE_PROVIDER` = `local` (default) | `s3`
 * - local: `LOCAL_STORAGE_ROOT` (optional)
 * - s3: `STORAGE_CONTAINER` (bucket), `AWS_REGION`, optional `AWS_S3_ENDPOINT`
 */
export async function loadStorageConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Promise<StorageConfig> {
  const kind = (env.STORAGE_PROVIDER ?? "local").trim().toLowerCase();

  if (kind === "s3") {
    const bucket = env.STORAGE_CONTAINER?.trim();
    const region = env.AWS_REGION?.trim();
    if (!bucket) {
      throw new Error(
        "STORAGE_PROVIDER=s3 requires STORAGE_CONTAINER (bucket name).",
      );
    }
    if (!region) {
      throw new Error("STORAGE_PROVIDER=s3 requires AWS_REGION.");
    }
    const endpoint = env.AWS_S3_ENDPOINT?.trim();
    return {
      kind: "s3",
      bucket,
      region,
      ...(endpoint ? { endpoint } : {}),
    };
  }

  if (kind !== "local") {
    throw new Error(
      `Unsupported STORAGE_PROVIDER="${kind}". Expected "local" or "s3".`,
    );
  }

  return {
    kind: "local",
    rootDir: await resolveLocalStorageRoot(env.LOCAL_STORAGE_ROOT),
  };
}

/** Values persisted on `storage_objects` for the active config. */
export function storageIdentityFromConfig(config: StorageConfig): {
  provider: "local" | "s3";
  container: string;
} {
  if (config.kind === "s3") {
    return { provider: "s3", container: config.bucket };
  }
  return { provider: "local", container: "local-development" };
}
