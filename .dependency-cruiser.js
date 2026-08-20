/**
 * Enforces the layering described in README.md's "MCP & Services
 * Architecture" section framework rules. Path
 * patterns are matched against dependency-cruiser's post-resolution paths
 * (pnpm workspace symlinks are followed and normalized back to the real
 * `packages/*` / `apps/*` source files), so these rules hold regardless of
 * whether an import uses a relative path or a `@ai-catalyst/*` package name.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment:
        "Circular dependencies make the intended one-directional layering meaningless.",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      severity: "warn",
      comment:
        "Scaffold-only files (e.g. package.json/tsconfig.json siblings) are expected to be orphans until implemented — warn, don't fail.",
      from: { orphan: true, pathNot: ["\\.d\\.ts$"] },
      to: {},
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      comment:
        "Import points at a module dependency-cruiser can't resolve on disk.",
      from: {},
      to: { couldNotResolve: true },
    },

    {
      name: "packages-cannot-import-apps",
      severity: "error",
      comment: "packages/* is consumed by apps/*, never the reverse.",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "web-cannot-import-mcp",
      severity: "error",
      comment:
        "apps/web and apps/mcp are independent deployables that must only share code via packages/*.",
      from: { path: "^apps/web/" },
      to: { path: "^apps/mcp/" },
    },
    {
      name: "mcp-cannot-import-web",
      severity: "error",
      comment:
        "apps/web and apps/mcp are independent deployables that must only share code via packages/*.",
      from: { path: "^apps/mcp/" },
      to: { path: "^apps/web/" },
    },

    {
      name: "contracts-is-a-leaf",
      severity: "error",
      comment:
        "packages/contracts holds cross-cutting types only (e.g. ActorContext) and must not depend on any other workspace package.",
      from: { path: "^packages/contracts/" },
      to: { path: "^(apps|packages)/", pathNot: "^packages/contracts/" },
    },
    {
      name: "db-is-a-leaf",
      severity: "error",
      comment:
        "packages/db (pool + migration runner) must stay free of business logic, or the migration CLI would pull in the whole service layer.",
      from: { path: "^packages/db/" },
      to: { path: "^(apps|packages)/", pathNot: "^packages/db/" },
    },
    {
      name: "observability-is-a-leaf",
      severity: "error",
      comment:
        "packages/observability is a cross-cutting leaf (logger + redaction) and must not depend on services/db/apps.",
      from: { path: "^packages/observability/" },
      to: { path: "^(apps|packages)/", pathNot: "^packages/observability/" },
    },
    {
      name: "clients-cannot-import-services-or-db",
      severity: "error",
      comment:
        "packages/clients (outbound HTTP clients, e.g. FastAPI) may use packages/contracts but must never call back into services/db.",
      from: { path: "^packages/clients/" },
      to: { path: "^packages/(services|db)/" },
    },

    {
      name: "only-services-may-import-clients",
      severity: "error",
      comment:
        "FastAPI is internal-only, reached exclusively through packages/services — apps/web and apps/mcp must never import packages/clients directly.",
      from: { path: "^apps/" },
      to: { path: "^packages/clients/" },
    },
    {
      name: "only-web-may-import-db-pool",
      severity: "error",
      comment:
        "packages/db is consumed by packages/services, and by apps/web only for the raw pg.Pool (e.g. a Better Auth adapter). apps/mcp must go through packages/services instead of touching the database directly.",
      from: { path: "^apps/mcp/" },
      to: { path: "^packages/db/" },
    },
    {
      name: "services-cannot-import-web-or-mcp",
      severity: "error",
      comment:
        "packages/services is shared business logic consumed by both apps/web and apps/mcp — it must stay app-agnostic.",
      from: { path: "^packages/services/" },
      to: { path: "^apps/" },
    },

    {
      name: "toolkit-content-and-shared-are-leaves",
      severity: "error",
      comment:
        "Content and shared-type packages must not depend on business logic or app code.",
      from: { path: "^packages/(toolkit-content|shared)/" },
      to: { path: "^apps/" },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    // apps/web's "@/*" alias is resolved via a minimal webpack config
    // instead of options.tsConfig: dependency-cruiser only supports one
    // tsconfig "project" at a time and resolves its include/exclude globs
    // relative to the wrong base directory in a multi-package monorepo
    // (see sverweij/dependency-cruiser#859/#862) — the webpack alias route
    // sidesteps that entirely.
    webpackConfig: {
      fileName: ".dependency-cruiser.webpack.js",
    },
    doNotFollow: {
      path: "node_modules",
    },
    exclude: {
      path: "(^|/)(node_modules|dist|\\.next|coverage)($|/)",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
  },
};
