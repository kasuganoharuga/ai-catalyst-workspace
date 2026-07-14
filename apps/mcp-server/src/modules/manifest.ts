import fs from "node:fs/promises";
import { resolveManifestPath } from "../repoRoot.js";

type ManifestModuleEntry = {
  id: string;
  slug: string;
  title: string;
};

type ManifestFile = {
  modules: ManifestModuleEntry[];
};

let cachedManifest: ManifestFile | undefined;

async function loadManifest(): Promise<ManifestFile> {
  if (cachedManifest) {
    return cachedManifest;
  }
  const manifestPath = resolveManifestPath();
  let raw: string;
  try {
    raw = await fs.readFile(manifestPath, "utf8");
  } catch (error) {
    throw new Error(
      `Could not read toolkit manifest at ${manifestPath}. Set AI_CATALYST_REPO_ROOT to the repo root if the working directory is not the repo root. Original error: ${String(error)}`,
    );
  }
  const parsed = JSON.parse(raw) as ManifestFile;
  if (!Array.isArray(parsed.modules)) {
    throw new Error(`Manifest at ${manifestPath} is missing a "modules" array.`);
  }
  cachedManifest = parsed;
  return parsed;
}

/** Returns module ids in manifest (authoring) order - never JSON-array-insertion order from a different file. */
export async function readManifestModuleOrder(): Promise<string[]> {
  const manifest = await loadManifest();
  return manifest.modules.map((module) => module.id);
}

export async function getManifestModuleBySlugOrId(slugOrId: string): Promise<ManifestModuleEntry | undefined> {
  const manifest = await loadManifest();
  return manifest.modules.find((module) => module.id === slugOrId || module.slug === slugOrId);
}

export async function getNextModuleId(moduleId: string): Promise<string | undefined> {
  const order = await readManifestModuleOrder();
  const index = order.indexOf(moduleId);
  if (index === -1 || index === order.length - 1) {
    return undefined;
  }
  return order[index + 1];
}

/**
 * Startup sanity check: fail loudly at boot if the manifest no longer has
 * module-01-pressure-test immediately followed by module-02-hmw, instead of
 * silently treating "no next module" as valid at runtime.
 */
export async function assertManifestShapeForPoc(): Promise<void> {
  const order = await readManifestModuleOrder();
  const pressureTestIndex = order.indexOf("module-01-pressure-test");
  if (pressureTestIndex === -1) {
    throw new Error('Manifest sanity check failed: "module-01-pressure-test" was not found in packages/toolkit-content/manifest.json.');
  }
  const next = order[pressureTestIndex + 1];
  if (next !== "module-02-hmw") {
    throw new Error(
      `Manifest sanity check failed: expected "module-02-hmw" to immediately follow "module-01-pressure-test", found "${next ?? "<none>"}" instead. Update moduleDefinitions.ts's nextModuleId expectations if the manifest order changed intentionally.`,
    );
  }
}

export async function resetManifestCacheForTests(): Promise<void> {
  cachedManifest = undefined;
}
