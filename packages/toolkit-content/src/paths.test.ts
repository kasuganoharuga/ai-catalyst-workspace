import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { modulesDir, skillsDir, toolkitContentRoot } from "./paths.js";

describe("toolkit-content paths", () => {
  it("resolves toolkitContentRoot to this package's root", () => {
    expect(existsSync(path.join(toolkitContentRoot, "package.json"))).toBe(
      true,
    );
  });

  it("finds manifest.json under the content root", () => {
    expect(existsSync(path.join(toolkitContentRoot, "manifest.json"))).toBe(
      true,
    );
  });

  it("finds the modules and skills directories", () => {
    expect(existsSync(modulesDir)).toBe(true);
    expect(existsSync(skillsDir)).toBe(true);
  });

  it("resolves the same regardless of process.cwd()", async () => {
    const originalCwd = process.cwd();
    process.chdir(path.parse(originalCwd).root);
    try {
      const { toolkitContentRoot: rootFromDifferentCwd } =
        await import("./paths.js");
      expect(rootFromDifferentCwd).toBe(toolkitContentRoot);
    } finally {
      process.chdir(originalCwd);
    }
  });
});
