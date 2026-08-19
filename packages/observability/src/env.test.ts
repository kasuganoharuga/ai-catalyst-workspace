import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { resolveAppEnv } from "@ai-catalyst/observability/env";

const here = path.dirname(fileURLToPath(import.meta.url));
const envSource = readFileSync(path.join(here, "env.ts"), "utf8");

/**
 * Comments in env.ts discuss the very spellings asserted against below, so a
 * check over the raw file would match its own documentation. Only executable
 * source counts.
 */
const envCode = envSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

describe("resolveAppEnv", () => {
  it("passes through the three known deployments and treats the rest as local", () => {
    expect(resolveAppEnv("local")).toBe("local");
    expect(resolveAppEnv("staging")).toBe("staging");
    expect(resolveAppEnv("production")).toBe("production");
    expect(resolveAppEnv("preview")).toBe("local");
    expect(resolveAppEnv(undefined)).toBe("local");
  });
});

/**
 * A source-shape assertion rather than a behavioural one, because the failure
 * it guards is invisible at this level.
 *
 * Next.js hands a public variable to the browser by substituting the exact
 * source text `process.env.NEXT_PUBLIC_FOO` during the build. A dynamic
 * `process.env[name]` read is not matched — it survives into the bundle and
 * evaluates to undefined in the browser. Both spellings behave identically
 * under vitest, which runs in Node with a real `process.env`, so no amount of
 * mocking here would distinguish them; the difference only appears in a built
 * client bundle. This has already regressed once, silently stripping the
 * environment and release from every browser-side Sentry event.
 */
describe("browser env reads survive the Next.js build", () => {
  it.each([
    ["process.env.NEXT_PUBLIC_APP_ENV", "resolveBrowserAppEnv"],
    ["process.env.NEXT_PUBLIC_RELEASE", "resolveBrowserRelease"],
  ])("reads %s as literal member access", (literal) => {
    expect(envCode).toContain(literal);
  });

  it("never reads a NEXT_PUBLIC_ name through the dynamic helper", () => {
    expect(envCode).not.toMatch(/readEnv\(\s*"NEXT_PUBLIC_/);
  });
});
