import { describe, expect, it, vi } from "vitest";

import { sha256 } from "@ai-catalyst/services/storage/internal/hash";

import { S3StorageProvider } from "./s3.js";

describe("S3StorageProvider", () => {
  it("putObject sends PutObject and returns local sha256 metadata", async () => {
    const send = vi.fn().mockResolvedValue({});
    const provider = new S3StorageProvider({
      bucket: "ai-catalyst-staging",
      region: "ap-southeast-2",
      client: { send } as never,
    });
    const body = Buffer.from("s3 bytes", "utf8");
    const meta = await provider.putObject({
      key: "k/obj.md",
      body,
      contentType: "text/markdown",
    });
    expect(meta).toEqual({
      sizeBytes: body.byteLength,
      sha256: sha256(body),
    });
    expect(send).toHaveBeenCalledOnce();
  });

  it("exists is false when HeadObject returns NotFound", async () => {
    const send = vi.fn().mockRejectedValue(
      Object.assign(new Error("missing"), {
        name: "NotFound",
        $metadata: { httpStatusCode: 404 },
      }),
    );
    const provider = new S3StorageProvider({
      bucket: "b",
      region: "ap-southeast-2",
      client: { send } as never,
    });
    expect(await provider.exists("missing.md")).toBe(false);
  });

  it("createDownloadUrl rejects when the object is missing", async () => {
    const provider = new S3StorageProvider({
      bucket: "b",
      region: "ap-southeast-2",
      client: {
        send: vi
          .fn()
          .mockRejectedValue(
            Object.assign(new Error("missing"), { name: "NoSuchKey" }),
          ),
      } as never,
    });
    await expect(
      provider.createDownloadUrl({ key: "x", expiresInSeconds: 30 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("copyObject issues CopyObject then headObject (GetObject when no checksum)", async () => {
    const body = Buffer.from("abc", "utf8");
    const send = vi
      .fn()
      .mockResolvedValueOnce({}) // CopyObject
      .mockResolvedValueOnce({ ContentLength: body.byteLength }) // HeadObject
      .mockResolvedValueOnce({ Body: body }); // GetObject fallback
    const provider = new S3StorageProvider({
      bucket: "bucket",
      region: "ap-southeast-2",
      client: { send } as never,
    });
    const meta = await provider.copyObject({
      sourceKey: "a.md",
      destinationKey: "b.md",
    });
    expect(meta).toEqual({
      sizeBytes: body.byteLength,
      sha256: sha256(body),
    });
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("headObject uses ChecksumSHA256 from Head when present", async () => {
    const body = Buffer.from("checksummed", "utf8");
    const digest = sha256(body);
    const send = vi.fn().mockResolvedValue({
      ContentLength: body.byteLength,
      ChecksumSHA256: Buffer.from(digest, "hex").toString("base64"),
    });
    const provider = new S3StorageProvider({
      bucket: "b",
      region: "ap-southeast-2",
      client: { send } as never,
    });
    const meta = await provider.headObject("k.md");
    expect(meta).toEqual({ sizeBytes: body.byteLength, sha256: digest });
    expect(send).toHaveBeenCalledOnce();
  });

  it("deleteObject is idempotent at the API layer (send always called)", async () => {
    const send = vi.fn().mockResolvedValue({});
    const provider = new S3StorageProvider({
      bucket: "b",
      region: "ap-southeast-2",
      client: { send } as never,
    });
    await provider.deleteObject("gone.md");
    expect(send).toHaveBeenCalledOnce();
  });
});
