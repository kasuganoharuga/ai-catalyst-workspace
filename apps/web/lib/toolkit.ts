import { promises as fs } from "node:fs";
import path from "node:path";
import { cache } from "react";

import manifest from "@ai-catalyst/toolkit-content/manifest.json";
import type { ToolkitManifest, ToolkitModule } from "@ai-catalyst/shared";

const toolkitManifest = manifest as ToolkitManifest;
const contentRoot = path.resolve(
  process.cwd(),
  "../../packages/toolkit-content",
);

export const getToolkitManifest = cache(async () => toolkitManifest);

export const getToolkitModules = cache(async () => toolkitManifest.modules);

export const getToolkitModule = cache(async (moduleId: string) =>
  toolkitManifest.modules.find((module) => module.id === moduleId),
);

export async function getModuleMarkdown(module: ToolkitModule) {
  return fs.readFile(path.join(contentRoot, module.modulePath), "utf8");
}

export async function getSkillFile(module: ToolkitModule) {
  return fs.readFile(
    path.join(contentRoot, "skills", module.id, "SKILL.md"),
    "utf8",
  );
}
