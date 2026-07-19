import { promises as fs } from "node:fs";
import path from "node:path";

import manifestJson from "@ai-catalyst/toolkit-content/manifest.json" with { type: "json" };
import { toolkitContentRoot } from "@ai-catalyst/toolkit-content/paths";
import type { ToolkitManifest, ToolkitModule } from "@ai-catalyst/shared";

const toolkitManifest = manifestJson as ToolkitManifest;

// Module ids are authored in manifest.json and are trusted, but this still
// guards the filesystem reads below in case a caller ever passes through an
// unvalidated route param instead of a manifest-matched id.
const MODULE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function resolveWithinContentRoot(...segments: string[]): string {
  const resolved = path.resolve(toolkitContentRoot, ...segments);
  const relativeToRoot = path.relative(toolkitContentRoot, resolved);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error(
      `Refusing to read a path outside the toolkit content root: ${resolved}`,
    );
  }

  return resolved;
}

export async function getToolkitManifest(): Promise<ToolkitManifest> {
  return toolkitManifest;
}

export async function getToolkitModules(): Promise<ToolkitModule[]> {
  return toolkitManifest.modules;
}

export async function getToolkitModule(
  moduleId: string,
): Promise<ToolkitModule | undefined> {
  if (!MODULE_SLUG_PATTERN.test(moduleId)) {
    return undefined;
  }

  return toolkitManifest.modules.find((module) => module.id === moduleId);
}

export async function getModuleMarkdown(
  module: ToolkitModule,
): Promise<string> {
  const filePath = resolveWithinContentRoot(module.modulePath);
  return fs.readFile(filePath, "utf8");
}

export async function getSkillFile(module: ToolkitModule): Promise<string> {
  if (!MODULE_SLUG_PATTERN.test(module.id)) {
    throw new Error(`Invalid module id: ${module.id}`);
  }

  const filePath = resolveWithinContentRoot("skills", module.id, "SKILL.md");
  return fs.readFile(filePath, "utf8");
}
