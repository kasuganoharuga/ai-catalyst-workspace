import path from "node:path";

import type { NextConfig } from "next";

const workspaceRoot = path.join(__dirname, "..", "..");

const nextConfig: NextConfig = {
  transpilePackages: [
    "@ai-catalyst/shared",
    "@ai-catalyst/services",
    "@ai-catalyst/toolkit-content",
  ],
  // Standalone output + explicit tracing is what actually gets verified by
  // scripts/verify-standalone-build.mjs (see package.json's "test:standalone"
  // script) — a successful `next build` alone does not prove that
  // packages/toolkit-content's files are included in the deployable output.
  output: "standalone",
  // Trace from the monorepo root so files outside apps/web (e.g.
  // packages/toolkit-content) are considered at all.
  outputFileTracingRoot: workspaceRoot,
  // Next's static analysis of packages/services/module's fs.readFile calls
  // isn't guaranteed to resolve manifest-driven paths, so the Toolkit
  // content this dynamic route consumes is included explicitly.
  outputFileTracingIncludes: {
    "/downloads/\\[module\\]": [
      "../../packages/toolkit-content/manifest.json",
      "../../packages/toolkit-content/skills/**/*",
    ],
  },
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
