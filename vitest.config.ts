import path from "node:path";
import { defineConfig } from "vitest/config";

// Single source of truth for how tests are grouped across the workspace.
// Vitest 4 removed `vitest.workspace.ts` / `defineWorkspace`, so projects are
// declared inline here.
//
// The split is by database dependency, not by package: `pnpm test` runs
// everything that works offline, `pnpm test:db` runs everything that needs a
// migrated Postgres (see infra/docker/README.md). The `*.db.test.ts` filename
// suffix is the only thing that decides which group a file lands in — there is
// no hand-maintained file list to drift out of sync.

// Custom `exclude` replaces Vitest's defaults rather than adding to them, so
// node_modules has to be re-excluded explicitly. Without it, pnpm's workspace
// symlinks (e.g. apps/web/node_modules/@ai-catalyst/services) would be walked
// and every services suite collected a second time.
const NODE_MODULES = "**/node_modules/**";
const DB_TESTS = "**/*.db.test.ts";

const workspaceUnitTests = [
  "packages/*/src/**/*.test.ts",
  "apps/mcp/src/**/*.test.ts",
];
const workspaceDbTests = [
  "packages/*/src/**/*.db.test.ts",
  "apps/mcp/src/**/*.db.test.ts",
];

// apps/web needs its own resolve alias and dotenv setup file, which is why it
// can't just be folded into the globs above.
const webProject = {
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/web"),
    },
  },
};

const webTest = {
  root: "apps/web",
  setupFiles: ["./tests/setup.ts"],
};

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: workspaceUnitTests,
          exclude: [NODE_MODULES, DB_TESTS],
        },
      },
      {
        test: {
          name: "db",
          include: workspaceDbTests,
          exclude: [NODE_MODULES],
          // Real integration tests against one shared Postgres: they run
          // sequentially and don't retry, since retrying a failed database
          // assertion would just hide a real bug.
          fileParallelism: false,
        },
      },
      {
        ...webProject,
        test: {
          ...webTest,
          name: "web-unit",
          include: ["tests/**/*.test.ts"],
          exclude: [NODE_MODULES, DB_TESTS],
        },
      },
      {
        ...webProject,
        test: {
          ...webTest,
          name: "web-db",
          include: ["tests/**/*.db.test.ts"],
          exclude: [NODE_MODULES],
          fileParallelism: false,
        },
      },
    ],
  },
});
