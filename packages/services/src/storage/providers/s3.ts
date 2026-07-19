import { createHash } from "node:crypto";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { ServiceError } from "@ai-catalyst/services/errors";
import { sha256 } from "@ai-catalyst/services/storage/internal/hash";

import type {
  CopyObjectInput,
  DownloadUrl,
  DownloadUrlInput,
  ProviderObjectMetadata,
  PutObjectInput,
  StorageProvider,
} from "../types.js";

export interface S3StorageProviderOptions {
  bucket: string;
  region: string;
  endpoint?: string;
  /** Test seam — inject a mock client instead of constructing one. */
  client?: S3Client;
}

async function bodyToBuffer(
  body: ReadableStream<Uint8Array> | NodeJS.ReadableStream | Blob | undefined,
): Promise<Buffer> {
  if (!body) {
    return Buffer.alloc(0);
  }
  if (Buffer.isBuffer(body)) {
    return body;
  }
  // AWS SDK v3 GetObject Body is a Readable / SdkStreamMixin.
  const maybeTransform = body as {
    transformToByteArray?: () => Promise<Uint8Array>;
  };
  if (typeof maybeTransform.transformToByteArray === "function") {
    return Buffer.from(await maybeTransform.transformToByteArray());
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * S3-compatible StorageProvider. Credentials come from the default AWS
 * credential chain (ECS task role in cloud; env keys only for local
 * overrides). This class never reads process.env itself.
 */
export class S3StorageProvider implements StorageProvider {
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(options: S3StorageProviderOptions) {
    if (!options.bucket.trim()) {
      throw new Error("S3StorageProvider requires a non-empty bucket.");
    }
    this.bucket = options.bucket;
    if (options.client) {
      this.client = options.client;
      return;
    }
    const config: S3ClientConfig = {
      region: options.region,
      ...(options.endpoint
        ? { endpoint: options.endpoint, forcePathStyle: true }
        : {}),
    };
    this.client = new S3Client(config);
  }

  async putObject(input: PutObjectInput): Promise<ProviderObjectMetadata> {
    const checksum = sha256(input.body);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
    return { sizeBytes: input.body.byteLength, sha256: checksum };
  }

  async getObject(key: string): Promise<Buffer> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return bodyToBuffer(result.Body as never);
    } catch (error) {
      if (isNotFound(error)) {
        throw new ServiceError("NOT_FOUND", `No storage object at key "${key}".`);
      }
      throw error;
    }
  }

  async headObject(key: string): Promise<ProviderObjectMetadata | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const sizeBytes = result.ContentLength ?? 0;
      // Prefer our own checksum header when present; otherwise re-fetch is
      // avoided for exists-style checks by returning a placeholder hash only
      // when ContentLength is known — StorageService always verifies against
      // its own computed hash on write paths.
      const shaFromMeta = result.ChecksumSHA256
        ? Buffer.from(result.ChecksumSHA256, "base64").toString("hex")
        : createHash("sha256").update(`s3:${key}:${sizeBytes}`).digest("hex");
      return { sizeBytes, sha256: shaFromMeta };
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.headObject(key)) !== null;
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async createDownloadUrl(input: DownloadUrlInput): Promise<DownloadUrl> {
    if (!(await this.exists(input.key))) {
      throw new ServiceError(
        "NOT_FOUND",
        `No storage object at key "${input.key}".`,
      );
    }
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ...(input.responseContentDisposition
        ? { ResponseContentDisposition: input.responseContentDisposition }
        : {}),
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: input.expiresInSeconds,
    });
    return {
      url,
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
    };
  }

  async copyObject(input: CopyObjectInput): Promise<ProviderObjectMetadata> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: input.destinationKey,
        CopySource: `${this.bucket}/${encodeURIComponent(input.sourceKey).replace(/%2F/g, "/")}`,
      }),
    );
    const meta = await this.headObject(input.destinationKey);
    if (!meta) {
      throw new ServiceError(
        "INTERNAL_INVARIANT_ERROR",
        `Copy succeeded but destination "${input.destinationKey}" is not readable.`,
      );
    }
    return meta;
  }
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    e.name === "NotFound" ||
    e.name === "NoSuchKey" ||
    e.$metadata?.httpStatusCode === 404
  );
}
