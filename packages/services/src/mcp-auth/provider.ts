import type { McpProvider } from "@ai-catalyst/contracts/actor-context";

// Matched on registered redirect host, never client_name (DCR is unauthenticated).
// Audit metadata only — must not become a privilege boundary.

const PROVIDER_HOST_SUFFIXES: ReadonlyArray<
  readonly [McpProvider, readonly string[]]
> = [
  ["claude", ["claude.ai", "claude.com", "anthropic.com"]],
  ["openai", ["chatgpt.com", "openai.com"]],
];

function providerForHost(host: string): McpProvider | null {
  const normalized = host.toLowerCase();
  for (const [provider, suffixes] of PROVIDER_HOST_SUFFIXES) {
    for (const suffix of suffixes) {
      if (normalized === suffix || normalized.endsWith(`.${suffix}`)) {
        return provider;
      }
    }
  }
  return null;
}

/** Returns matched provider or "other" when unrecognised or ambiguous. */
export function mcpProviderForRedirectUris(
  redirectUris: readonly string[],
): McpProvider {
  const matched = new Set<McpProvider>();

  for (const uri of redirectUris) {
    let host: string;
    try {
      host = new URL(uri).hostname;
    } catch {
      continue;
    }
    const provider = providerForHost(host);
    if (provider) {
      matched.add(provider);
    }
  }

  return matched.size === 1 ? [...matched][0]! : "other";
}

/** Parses comma-joined mcp_oauth_applications.redirect_urls. */
export function parseRedirectUrls(value: string | null | undefined): string[] {
  if (typeof value !== "string") {
    return [];
  }
  return value
    .split(",")
    .map((uri) => uri.trim())
    .filter((uri) => uri.length > 0);
}
