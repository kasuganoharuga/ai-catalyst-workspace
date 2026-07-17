import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Express middleware that rejects cross-origin browser requests whose `Origin`
 * header is not on the allowlist. Complements the SDK's `hostHeaderValidation`
 * (which checks the `Host` header): `Host` protects against DNS rebinding,
 * `Origin` protects against a malicious page in the user's browser silently
 * issuing same-host requests. Requests without an `Origin` header (server-to-
 * server clients, curl, MCP agent clients) are not browser-originated and are
 * always allowed through.
 */
export function originAllowlist(allowedOrigins: string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin === undefined || allowedOrigins.includes(origin)) {
      next();
      return;
    }

    res.status(403).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: `Invalid Origin: ${origin}` },
      id: null,
    });
  };
}
