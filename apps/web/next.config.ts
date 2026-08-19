import path from "node:path";

import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const workspaceRoot = path.join(__dirname, "..", "..");

const nextConfig: NextConfig = {
  transpilePackages: [
    "@ai-catalyst/shared",
    "@ai-catalyst/services",
    "@ai-catalyst/toolkit-content",
    "@ai-catalyst/observability",
  ],
  // Verified by scripts/verify-standalone-build.mjs (package.json's
  // "test:standalone"): a successful `next build` does not prove the
  // standalone output actually boots and serves.
  output: "standalone",
  // Trace from the monorepo root so files outside apps/web — the workspace
  // packages in transpilePackages — are considered at all.
  outputFileTracingRoot: workspaceRoot,
  // No outputFileTracingIncludes: /downloads was the only route that read
  // packages/toolkit-content off disk at request time, and it is retired.
  // Toolkit content is now read at seed time only.
  // Mentors used to land on /toolkit; that route is gone. Send bookmarks
  // and old ROLE_DESTINATION targets to the role-aware dashboard.
  async redirects() {
    return [
      { source: "/toolkit", destination: "/dashboard", permanent: true },
      {
        source: "/toolkit/:path*",
        destination: "/dashboard",
        permanent: true,
      },
    ];
  },
  /**
   * Baseline security headers on every response, API routes included.
   *
   * Sent unconditionally rather than gated on APP_ENV: `headers()` is
   * evaluated at build time, and the Docker build deliberately has no real
   * APP_ENV (see the ARG block in apps/web/Dockerfile), so an env-gated list
   * would silently ship empty. None of these harm local development — HSTS in
   * particular is only honoured by browsers over a secure transport, so it is
   * inert on http://localhost.
   *
   * Deliberately absent: Content-Security-Policy. A script-src worth having
   * needs per-request nonces threaded through middleware, and a CSP written
   * without testing every page either breaks Next's hydration or gets
   * loosened to `unsafe-inline` until it asserts nothing. That is its own
   * piece of work; shipping a decorative CSP would only make this list look
   * more complete than it is.
   */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            // One year, but neither `includeSubDomains` nor `preload`. Both
            // are one-way doors that would also commit every current and
            // future subdomain to HTTPS; add them once the full subdomain
            // inventory is known to qualify.
            key: "Strict-Transport-Security",
            value: "max-age=31536000",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            // No page here is meant to be framed. The MCP OAuth consent screen
            // is a top-level redirect, not an embed, so denying outright costs
            // nothing and removes the clickjacking surface from the one flow
            // where a stolen click grants an agent access to a workspace.
            key: "X-Frame-Options",
            value: "DENY",
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  turbopack: {
    root: workspaceRoot,
  },
};

export default withSentryConfig(nextConfig, {
  // Source-map upload is opt-in via SENTRY_AUTH_TOKEN in CI — empty token
  // skips upload without failing the build.
  silent: true,
  widenClientFileUpload: true,
  disableLogger: true,
});
