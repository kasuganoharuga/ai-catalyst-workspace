import type { NextFunction, Request, RequestHandler, Response } from "express";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { ServiceError } from "@ai-catalyst/services/errors";
import { verifyMcpBearerToken } from "@ai-catalyst/services/mcp-auth";

// The standard way to extend Express's Request type without a direct
// dependency on the transitive `@types/express-serve-static-core` package
// (module augmentation must target a module specifier this app can resolve
// on its own).
declare global {
  namespace Express {
    interface Request {
      /** Set by `verifyBearerToken` once the platform Bearer token has been verified. */
      actorContext?: ActorContext;
    }
  }
}

export interface VerifyBearerOptions {
  /**
   * Absolute URL of this Resource Server's own
   * `/.well-known/oauth-protected-resource` document (RFC 9728) — sent back
   * in every 401/403's `WWW-Authenticate` header so a compliant client can
   * discover which Authorization Server to use without being told out of
   * band.
   */
  protectedResourceMetadataUrl: string;
  /**
   * Swappable for tests — defaults to the real
   * `@ai-catalyst/services/mcp-auth` verification (a real database lookup).
   */
  verify?: (rawToken: unknown) => Promise<ActorContext>;
}

const BEARER_TOKEN_PATTERN = /^Bearer\s+(.+)$/i;

function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = BEARER_TOKEN_PATTERN.exec(header.trim());
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : null;
}

function jsonRpcAuthError(message: string) {
  return {
    jsonrpc: "2.0" as const,
    error: { code: -32001, message },
    id: null,
  };
}

// RFC 9728 discovery challenge, present on every 401/403 this middleware
// returns — this is what lets an MCP client that only knows this server's
// URL find the Authorization Server (apps/web) on its own.
function resourceMetadataChallenge(
  protectedResourceMetadataUrl: string,
  extra?: string,
): string {
  const parts = [`resource_metadata="${protectedResourceMetadataUrl}"`];
  if (extra) parts.unshift(extra);
  return `Bearer ${parts.join(", ")}`;
}

/**
 * Verifies the platform Bearer token and sets req.actorContext for tool handlers.
 * The only auth check on incoming MCP requests.
 */
export function verifyBearerToken(
  options: VerifyBearerOptions,
): RequestHandler {
  const verify = options.verify ?? verifyMcpBearerToken;

  return (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      const token = parseBearerToken(req.headers.authorization);
      if (!token) {
        res
          .status(401)
          .set(
            "WWW-Authenticate",
            resourceMetadataChallenge(options.protectedResourceMetadataUrl),
          )
          .json(jsonRpcAuthError("Missing bearer token."));
        return;
      }

      try {
        req.actorContext = await verify(token);
        next();
      } catch (error) {
        if (error instanceof ServiceError && error.code === "UNAUTHENTICATED") {
          res
            .status(401)
            .set(
              "WWW-Authenticate",
              resourceMetadataChallenge(options.protectedResourceMetadataUrl),
            )
            .json(jsonRpcAuthError(error.message));
          return;
        }

        if (error instanceof ServiceError && error.code === "FORBIDDEN") {
          // The /mcp/authorize before-hook (apps/web/lib/mcp-oauth-compat)
          // always force-normalizes the granted scope to exactly
          // "mcp:connect offline_access", so the missing-scope branch of
          // verifyMcpBearerToken is only reachable via direct database
          // tampering — but its error message is still distinct and
          // checked here so a real client would still get an accurate
          // RFC 6750 `insufficient_scope` challenge, not a generic 403, in
          // that case.
          const isScopeError = error.message.includes("mcp:connect scope");
          res
            .status(403)
            .set(
              "WWW-Authenticate",
              resourceMetadataChallenge(
                options.protectedResourceMetadataUrl,
                isScopeError ? 'error="insufficient_scope"' : undefined,
              ),
            )
            .json(jsonRpcAuthError(error.message));
          return;
        }

        console.error("Unexpected error verifying MCP bearer token:", error);
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error." },
          id: null,
        });
        return;
      }
    })();
  };
}
