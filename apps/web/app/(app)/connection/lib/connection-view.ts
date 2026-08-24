import type { McpConnectionStatus } from "@ai-catalyst/services/mcp-auth";
import type { UserProfile } from "@ai-catalyst/shared";

import {
  deriveMcpConnectionState,
  getMcpEndpointUrl,
  type McpConnectionState,
} from "@/lib/mcp-connection";

import { resolveAssistant, type Assistant } from "../../lib/assistant";

export interface ConnectionView {
  assistant: Assistant;
  connectedProvider: "claude" | "openai" | null;
  connected: Assistant;
  mismatched: boolean;
  endpointUrl: string | null;
  state: McpConnectionState;
  isAuthorised: boolean;
  connectionExpired: boolean;
}

export function deriveConnectionView(
  connection: McpConnectionStatus,
  profile: UserProfile,
): ConnectionView {
  // `assistant` = website preference (walkthrough). `connected` = live grant by redirect host (status card).
  const assistant = resolveAssistant(profile.preferredAiProvider);
  const connectedProvider =
    connection.provider === "claude" || connection.provider === "openai"
      ? connection.provider
      : null;
  const connected = connectedProvider
    ? resolveAssistant(connectedProvider)
    : assistant;
  const mismatched =
    connectedProvider !== null && connectedProvider !== assistant.provider;
  const endpointUrl = getMcpEndpointUrl();
  const state = deriveMcpConnectionState(connection);
  const isAuthorised = connection.authorised;
  const connectionExpired = state === "expired";

  return {
    assistant,
    connectedProvider,
    connected,
    mismatched,
    endpointUrl,
    state,
    isAuthorised,
    connectionExpired,
  };
}
