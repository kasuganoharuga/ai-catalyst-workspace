/**
 * mcp-auth barrel — siblings use @ai-catalyst/services/mcp-auth/... package paths,
 * not relative imports: Turbopack (transpilePackages) cannot resolve ./x.js from
 * a package-path entry (see vercel/next.js#82945).
 */

export {
  GRANTED_MCP_SCOPES,
  MCP_GRANT_ABSOLUTE_MAX_AGE_MS,
  MCP_GRANT_IDLE_TIMEOUT_MS,
  mcpCodeVerificationSchema,
} from "@ai-catalyst/services/mcp-auth/types";
export type {
  AuthorizationCodeCheckFailure,
  AuthorizationCodeCheckResult,
  AuthorizationCodeRejectionReason,
  McpCodeVerification,
} from "@ai-catalyst/services/mcp-auth/types";

export { mcpProviderForRedirectUris } from "@ai-catalyst/services/mcp-auth/provider";

export { verifyMcpBearerToken } from "@ai-catalyst/services/mcp-auth/bearer";

export {
  checkAuthorizationCodeIsRedeemable,
  getPendingMcpConsentRequest,
  tryClaimConsentCode,
} from "@ai-catalyst/services/mcp-auth/authorization-code";
export type { PendingMcpConsentRequest } from "@ai-catalyst/services/mcp-auth/authorization-code";

export {
  checkRefreshTokenIsRedeemable,
  clampMcpRefreshTokenExpiryToGrant,
  rotateOutMcpRefreshToken,
  tryClaimRefreshToken,
} from "@ai-catalyst/services/mcp-auth/refresh";

export { recordMcpGrantIssued } from "@ai-catalyst/services/mcp-auth/grants";

export {
  getMcpConnectionStatus,
  getMcpConnectionToBeReplaced,
  revokeAllMcpConnectionsForUserId,
  revokeMcpAccessToken,
  revokeMcpConnectionForUser,
} from "@ai-catalyst/services/mcp-auth/connections";
export type {
  McpConnectionStatus,
  McpRevocationResult,
} from "@ai-catalyst/services/mcp-auth/connections";

export { cleanupExpiredMcpOAuthState } from "@ai-catalyst/services/mcp-auth/cleanup";
export type { McpOAuthCleanupResult } from "@ai-catalyst/services/mcp-auth/cleanup";

export {
  getAuthorizableUserById,
  getOAuthClientByClientId,
  isValidPublicOAuthClientRecord,
} from "@ai-catalyst/services/mcp-auth/internal/lookups";
export type {
  AuthorizableUser,
  McpOAuthClientRecord,
} from "@ai-catalyst/services/mcp-auth/internal/lookups";
