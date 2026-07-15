import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import type { ToolkitModule } from "@ai-catalyst/shared";

import {
  getModuleMarkdown,
  getSkillFile,
  getToolkitManifest,
  getToolkitModule,
  getToolkitModules,
} from "./index.js";

describe("module content service", () => {
  it("returns the toolkit manifest", async () => {
    const manifest = await getToolkitManifest();
    expect(manifest.modules.length).toBeGreaterThan(0);
    expect(typeof manifest.version).toBe("string");
  });

  it("returns the same modules array as the manifest", async () => {
    const manifest = await getToolkitManifest();
    const modules = await getToolkitModules();
    expect(modules).toBe(manifest.modules);
  });

  it("finds a module by a valid, known id", async () => {
    const [first] = await getToolkitModules();
    const found = await getToolkitModule(first.id);
    expect(found).toEqual(first);
  });

  it("returns undefined for an id that does not exist in the manifest", async () => {
    const found = await getToolkitModule("not-a-real-module");
    expect(found).toBeUndefined();
  });

  it("returns undefined instead of throwing for a path-traversal-shaped id", async () => {
    await expect(
      getToolkitModule("../../../../etc/passwd"),
    ).resolves.toBeUndefined();
    await expect(getToolkitModule("../../package.json")).resolves.toBeUndefined();
  });

  describe("with a real module", () => {
    let module: ToolkitModule;

    beforeAll(async () => {
      const [first] = await getToolkitModules();
      module = first;
    });

    it("reads the module markdown as UTF-8 text", async () => {
      const markdown = await getModuleMarkdown(module);
      expect(markdown.length).toBeGreaterThan(0);
    });

    it("reads the module's SKILL.md file", async () => {
      const skill = await getSkillFile(module);
      expect(skill).toContain("#");
    });

    it("rejects a module-shaped object whose id attempts path traversal", async () => {
      const maliciousModule: ToolkitModule = {
        ...module,
        id: "../../../../etc",
      };

      await expect(getSkillFile(maliciousModule)).rejects.toThrow();
    });

    it("rejects a modulePath that attempts to escape the content root", async () => {
      const maliciousModule: ToolkitModule = {
        ...module,
        modulePath: "../../../package.json",
      };

      await expect(getModuleMarkdown(maliciousModule)).rejects.toThrow(
        /outside the toolkit content root/,
      );
    });
  });

  it("resolves content the same way regardless of process.cwd()", async () => {
    const originalCwd = process.cwd();
    process.chdir(path.parse(originalCwd).root);
    try {
      const manifest = await getToolkitManifest();
      const [first] = manifest.modules;
      const markdown = await getModuleMarkdown(first);
      expect(markdown.length).toBeGreaterThan(0);
    } finally {
      process.chdir(originalCwd);
    }
  });
});
