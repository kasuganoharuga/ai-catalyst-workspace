import {
  loadStorageConfigFromEnv,
  storageIdentityFromConfig,
  type StorageConfig,
} from "@ai-catalyst/services/storage/config";
import { resolveProvider as resolveProviderFromConfig } from "@ai-catalyst/services/storage/resolve-provider";

import type { StorageProvider } from "@ai-catalyst/services/storage/types";

export interface StorageServiceDependencies {
  // Test-only DI seam for a fake StorageProvider (same pattern as ModuleCatalogDependencies).
  provider?: StorageProvider;
  /** Override config used when `provider` is omitted (tests / custom roots). */
  storageConfig?: StorageConfig;
}

// Module-level singleton — deliberately one instance for the whole
// process, lazily resolved on first call and reused after. Moving this
// here (rather than duplicating it) is what keeps it a singleton: nothing
// else in the package may declare its own copy of this state.
let defaultProvider: StorageProvider | null = null;
let defaultConfig: StorageConfig | null = null;
let defaultProviderPromise: Promise<StorageProvider> | null = null;

export async function resolveProvider(
  deps: StorageServiceDependencies,
): Promise<StorageProvider> {
  if (deps.provider) {
    return deps.provider;
  }
  if (deps.storageConfig) {
    return resolveProviderFromConfig(deps.storageConfig);
  }
  if (defaultProvider) {
    return defaultProvider;
  }
  if (!defaultProviderPromise) {
    defaultProviderPromise = (async () => {
      defaultConfig = await loadStorageConfigFromEnv();
      defaultProvider = resolveProviderFromConfig(defaultConfig);
      return defaultProvider;
    })();
  }
  return defaultProviderPromise;
}

export function activeStorageIdentity(deps: StorageServiceDependencies): {
  provider: "local" | "s3";
  container: string;
} {
  if (deps.storageConfig) {
    return storageIdentityFromConfig(deps.storageConfig);
  }
  if (defaultConfig) {
    return storageIdentityFromConfig(defaultConfig);
  }
  // Before the lazy default provider has loaded, persist the local
  // convention (matches prior hardcoded constants and CI/default envs).
  return { provider: "local", container: "local-development" };
}
