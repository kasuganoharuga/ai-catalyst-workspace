import path from "node:path";

import type { NextConfig } from "next";

const workspaceRoot = path.join(__dirname, "..", "..");

const nextConfig: NextConfig = {
  transpilePackages: [
    "@ai-catalyst/shared",
    "@ai-catalyst/services",
    "@ai-catalyst/toolkit-content",
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
  turbopack: {
    root: workspaceRoot,
  },
};

export default nextConfig;
