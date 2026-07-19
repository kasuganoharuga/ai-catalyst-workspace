import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadStorageConfigFromEnv } from "./config.js";
import { LocalStorageProvider } from "./providers/local.js";
import { S3StorageProvider } from "./providers/s3.js";
import { resolveProvider } from "./resolve-provider.js";

describe("resolveProvider + StorageConfig", () => {
  let tmp: string | undefined;

  afterEach(async () => {
    if (tmp) {
      await fs.rm(tmp, { recursive: true, force: true });
      tmp = undefined;
    }
  });

  it("builds LocalStorageProvider from local config without reading env inside the provider", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "cfg-local-"));
    const provider = resolveProvider({ kind: "local", rootDir: tmp });
    expect(provider).toBeInstanceOf(LocalStorageProvider);
    await provider.putObject({
      key: "t.md",
      body: Buffer.from("ok"),
      contentType: "text/plain",
    });
    expect(await provider.exists("t.md")).toBe(true);
  });

  it("builds S3StorageProvider from s3 config", () => {
    const provider = resolveProvider({
      kind: "s3",
      bucket: "ai-catalyst-staging",
      region: "ap-southeast-2",
    });
    expect(provider).toBeInstanceOf(S3StorageProvider);
  });

  it("loadStorageConfigFromEnv switches provider via env object (no rebuild)", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "cfg-env-"));
    const local = await loadStorageConfigFromEnv({
      STORAGE_PROVIDER: "local",
      LOCAL_STORAGE_ROOT: tmp,
    });
    expect(local).toEqual({ kind: "local", rootDir: tmp });

    const s3 = await loadStorageConfigFromEnv({
      STORAGE_PROVIDER: "s3",
      STORAGE_CONTAINER: "ai-catalyst-staging",
      AWS_REGION: "ap-southeast-2",
    });
    expect(s3).toEqual({
      kind: "s3",
      bucket: "ai-catalyst-staging",
      region: "ap-southeast-2",
    });
  });
});
