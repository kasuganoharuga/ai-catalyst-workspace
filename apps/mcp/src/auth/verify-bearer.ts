import type { NextFunction, Request, RequestHandler, Response } from "express";

import type { ActorContext } from "@ai-catalyst/contracts/actor-context";
import { loggerForService } from "@ai-catalyst/observability/logger";
import { SERVICE_NAMES } from "@ai-catalyst/observability/service-names";
import { ServiceError } from "@ai-catalyst/services/errors";
import { verifyMcpBearerToken } from "@ai-catalyst/services/mcp-auth";

const log = loggerForService(SERVICE_NAMES.mcp);

// Express Request augmentation without a direct @types/express-serve-static-core dependency.
declare global {
  namespace Express {
    interface Request {
      /** Set by `verifyBearerToken` once the platform Bearer token has been verified. */
      actorContext?: ActorContext;
    }
  }
}

export interface VerifyBearerOptions {
  /** RFC 9728 protected-resource URL — sent in 401/403 WWW-Authenticate for AS discovery. */
  protectedResourceMetadataUrl: string;
  /** Swappable for tests; defaults to verifyMcpBearerToken (DB lookup). */
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

// RFC 9728 challenge on every 401/403 — lets MCP clients discover the Authorization Server.
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
          // Scope errors get RFC 6750 insufficient_scope; otherwise generic 403 (see mcp-oauth-compat authorize hook).
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

        log.error({
          event: "mcp_bearer_verify_failed",
          message: "Unexpected error verifying MCP bearer token",
          error_name: error instanceof Error ? error.name : "unknown",
        });
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
