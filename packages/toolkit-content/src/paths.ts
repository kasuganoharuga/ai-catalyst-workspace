import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolved from this module's own file location (via `import.meta.url`), not
// `process.cwd()`, so it resolves the same regardless of which package or
// working directory imports it. This package is consumed as TypeScript
// source directly by every workspace consumer (no separate build step for
// `packages/*` — see the root README's MCP & Services Architecture section),
// so `path.dirname(__filename)/..` from `src/paths.ts` always resolves to
// this package's root.
//
// Deliberately built with `path.join`/`path.dirname` rather than
// `new URL("..", import.meta.url)`: bundlers (webpack, Turbopack) statically
// detect the latter pattern to bundle a referenced asset, which breaks this
// package's Next.js consumers even though nothing here is an asset import.
const currentFileDir = path.dirname(fileURLToPath(import.meta.url));

export const toolkitContentRoot = path.join(currentFileDir, "..");

export const modulesDir = path.join(toolkitContentRoot, "modules");

export const skillsDir = path.join(toolkitContentRoot, "skills");
