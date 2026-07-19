import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { sha256 } from "@ai-catalyst/services/storage/internal/hash";

import { LocalStorageProvider } from "./local.js";

describe("LocalStorageProvider", () => {
  let rootDir: string;
  let provider: LocalStorageProvider;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-provider-"));
    provider = new LocalStorageProvider({ rootDir });
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it("put/get/exists/head/delete round-trip", async () => {
    const body = Buffer.from("hello artifact", "utf8");
    const meta = await provider.putObject({
      key: "ws/obj/hello.md",
      body,
      contentType: "text/markdown",
    });
    expect(meta.sizeBytes).toBe(body.byteLength);
    expect(meta.sha256).toBe(sha256(body));

    expect(await provider.exists("ws/obj/hello.md")).toBe(true);
    expect(await provider.getObject("ws/obj/hello.md")).toEqual(body);
    expect(await provider.headObject("ws/obj/hello.md")).toEqual(meta);

    await provider.deleteObject("ws/obj/hello.md");
    expect(await provider.exists("ws/obj/hello.md")).toBe(false);
    expect(await provider.headObject("ws/obj/hello.md")).toBeNull();
  });

  it("copyObject duplicates bytes under a new key", async () => {
    const body = Buffer.from("copy me", "utf8");
    await provider.putObject({
      key: "a/src.md",
      body,
      contentType: "text/markdown",
    });
    const copied = await provider.copyObject({
      sourceKey: "a/src.md",
      destinationKey: "a/dst.md",
    });
    expect(copied.sha256).toBe(sha256(body));
    expect(await provider.getObject("a/dst.md")).toEqual(body);
  });

  it("createDownloadUrl returns a file URL when the object exists", async () => {
    await provider.putObject({
      key: "a/file.md",
      body: Buffer.from("x"),
      contentType: "text/plain",
    });
    const download = await provider.createDownloadUrl({
      key: "a/file.md",
      expiresInSeconds: 60,
    });
    expect(download.url.startsWith("file://")).toBe(true);
    expect(download.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("requires an absolute rootDir (no process.env inside the provider)", () => {
    expect(() => new LocalStorageProvider({ rootDir: "relative" })).toThrow(
      /absolute rootDir/,
    );
  });
});
