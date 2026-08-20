import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  resolveClientIp,
  UNKNOWN_CLIENT_IP,
} from "@/lib/mcp-oauth-compat/dcr-validation";

/** Only the header matters here; the hook passes a whole Request through. */
function requestWithForwardedFor(value?: string) {
  return {
    request: new Request("https://example.com/api/auth/mcp/register", {
      method: "POST",
      headers: value === undefined ? {} : { "x-forwarded-for": value },
    }),
  };
}

const REAL_CLIENT = "203.0.113.7";
const SPOOFED = "198.51.100.99";

describe("resolveClientIp", () => {
  const original = process.env.MCP_OAUTH_TRUST_PROXY_HEADERS;

  afterEach(() => {
    if (original === undefined)
      delete process.env.MCP_OAUTH_TRUST_PROXY_HEADERS;
    else process.env.MCP_OAUTH_TRUST_PROXY_HEADERS = original;
  });

  describe("with no trusted proxy", () => {
    beforeEach(() => {
      delete process.env.MCP_OAUTH_TRUST_PROXY_HEADERS;
    });

    it("ignores the header entirely — a direct caller writes it freely", () => {
      expect(resolveClientIp(requestWithForwardedFor(SPOOFED))).toBe(
        UNKNOWN_CLIENT_IP,
      );
    });
  });

  describe("behind a trusted proxy", () => {
    beforeEach(() => {
      process.env.MCP_OAUTH_TRUST_PROXY_HEADERS = "true";
    });

    it("uses the only hop when the caller sent no header of their own", () => {
      expect(resolveClientIp(requestWithForwardedFor(REAL_CLIENT))).toBe(
        REAL_CLIENT,
      );
    });

    /**
     * The regression this fix exists for. ALB appends the address it received
     * rather than replacing the header, so a caller who sends
     * `X-Forwarded-For: <anything>` produces `<anything>, <real client>`.
     * Reading the leftmost entry handed them a bucket key they chose — a fresh
     * one on every request, which is no rate limit at all.
     */
    it("takes the rightmost hop, so a caller cannot choose their own bucket", () => {
      expect(
        resolveClientIp(requestWithForwardedFor(`${SPOOFED}, ${REAL_CLIENT}`)),
      ).toBe(REAL_CLIENT);
    });

    it("still takes the rightmost hop through a longer forged chain", () => {
      expect(
        resolveClientIp(
          requestWithForwardedFor(
            `10.0.0.1, ${SPOOFED}, 172.16.0.4, ${REAL_CLIENT}`,
          ),
        ),
      ).toBe(REAL_CLIENT);
    });

    it("tolerates the whitespace and empty entries a forged header may carry", () => {
      expect(
        resolveClientIp(
          requestWithForwardedFor(`${SPOOFED} ,, ${REAL_CLIENT} ,`),
        ),
      ).toBe(REAL_CLIENT);
    });

    it("falls back to the shared bucket when the header is absent or empty", () => {
      expect(resolveClientIp(requestWithForwardedFor())).toBe(
        UNKNOWN_CLIENT_IP,
      );
      expect(resolveClientIp(requestWithForwardedFor("   "))).toBe(
        UNKNOWN_CLIENT_IP,
      );
      expect(resolveClientIp(requestWithForwardedFor(",,"))).toBe(
        UNKNOWN_CLIENT_IP,
      );
    });

    it("falls back to the shared bucket when there is no request at all", () => {
      expect(resolveClientIp({})).toBe(UNKNOWN_CLIENT_IP);
    });
  });
});
