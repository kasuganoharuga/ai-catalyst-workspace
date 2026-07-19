/**
 * Offline smoke: storage put/get + email noop — no live AWS required.
 * Complements provider unit tests for CI acceptance.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createEmailSenderFromConfig } from "../email/index.js";
import { resolveProvider } from "./resolve-provider.js";

describe("cloud-prep smoke (local)", () => {
  let rootDir: string | undefined;

  afterEach(async () => {
    if (rootDir) {
      await fs.rm(rootDir, { recursive: true, force: true });
      rootDir = undefined;
    }
  });

  it("storage put/get and email enqueue (noop)", async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "smoke-storage-"));
    const storage = resolveProvider({ kind: "local", rootDir });
    const body = Buffer.from("# smoke\n", "utf8");
    await storage.putObject({
      key: "smoke/readme.md",
      body,
      contentType: "text/markdown",
    });
    expect(await storage.getObject("smoke/readme.md")).toEqual(body);

    const email = createEmailSenderFromConfig({ kind: "noop" });
    await email.enqueue({
      to: "smoke@example.com",
      subject: "smoke",
      text: "ok",
    });
  });
});
