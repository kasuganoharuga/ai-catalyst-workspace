import type { StorageConfig } from "@ai-catalyst/services/storage/config";
import { LocalStorageProvider } from "@ai-catalyst/services/storage/providers/local";
import { S3StorageProvider } from "@ai-catalyst/services/storage/providers/s3";

import type { StorageProvider } from "./types.js";

/** Build a StorageProvider from config. Providers never read process.env. */
export function resolveProvider(config: StorageConfig): StorageProvider {
  if (config.kind === "local") {
    return new LocalStorageProvider({ rootDir: config.rootDir });
  }
  return new S3StorageProvider({
    bucket: config.bucket,
    region: config.region,
    endpoint: config.endpoint,
  });
}
