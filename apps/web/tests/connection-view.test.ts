import { describe, expect, it } from "vitest";

import type { McpConnectionStatus } from "@ai-catalyst/services/mcp-auth";
import type { UserProfile } from "@ai-catalyst/shared";

import { deriveConnectionView } from "@/app/(app)/connection/lib/connection-view";

function connection(
  overrides: Partial<McpConnectionStatus>,
): McpConnectionStatus {
  return {
    authorised: true,
    clientName: "Test client",
    clientId: "client-1",
    authorisedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-02-01T00:00:00.000Z",
    hasEverAuthorised: true,
    lastActivityAt: "2026-01-15T00:00:00.000Z",
    provider: "claude",
    ...overrides,
  };
}

function profile(overrides: Partial<UserProfile>): UserProfile {
  return {
    userId: "u1",
    firstName: null,
    lastName: null,
    contactEmail: null,
    preferredAiProvider: "claude",
    jobTitle: null,
    bio: null,
    linkedinUrl: null,
    locale: "en-AU",
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe("deriveConnectionView", () => {
  it("is not mismatched when the authorised provider matches the profile preference", () => {
    const view = deriveConnectionView(
      connection({ provider: "claude" }),
      profile({ preferredAiProvider: "claude" }),
    );
    expect(view.mismatched).toBe(false);
    expect(view.connected.provider).toBe("claude");
  });

  it("is mismatched only when the authorised provider differs from the profile preference", () => {
    const view = deriveConnectionView(
      connection({ provider: "openai" }),
      profile({ preferredAiProvider: "claude" }),
    );
    expect(view.mismatched).toBe(true);
    expect(view.connected.provider).toBe("openai");
    expect(view.assistant.provider).toBe("claude");
  });

  it("is not mismatched when there is no authorised connection at all", () => {
    const view = deriveConnectionView(
      connection({ provider: null, authorised: false }),
      profile({ preferredAiProvider: "openai" }),
    );
    expect(view.mismatched).toBe(false);
  });

  it("falls back `connected` to the profile's assistant when the provider is neither claude nor openai", () => {
    const view = deriveConnectionView(
      connection({ provider: null }),
      profile({ preferredAiProvider: "openai" }),
    );
    expect(view.connectedProvider).toBeNull();
    expect(view.connected.provider).toBe("openai");
  });

  it("marks connectionExpired exactly when the derived state is expired", () => {
    const expired = deriveConnectionView(
      connection({ authorised: false, hasEverAuthorised: true }),
      profile({}),
    );
    expect(expired.state).toBe("expired");
    expect(expired.connectionExpired).toBe(true);

    const neverConnected = deriveConnectionView(
      connection({ authorised: false, hasEverAuthorised: false }),
      profile({}),
    );
    expect(neverConnected.state).toBe("not_connected");
    expect(neverConnected.connectionExpired).toBe(false);
  });
});
