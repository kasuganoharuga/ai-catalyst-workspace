// Checks that the database (after packages/db's migration runner has been
// applied) already has every table/column Better Auth's config in lib/auth.ts
// expects — without ever writing to the database itself.
//
// This deliberately does not use `auth generate`/`auth migrate`: `generate`
// only emits schema files, it doesn't check the database at all, and
// `migrate` would apply changes directly, bypassing packages/db's migration
// runner (the only place schema changes are allowed to happen — see
// infra/docker/README.md and packages/db/src/migrate.ts). `getMigrations` is
// Better Auth's own read-only diff: it returns what it would create/add
// without running anything, which is exactly the "did the last migration
// keep Better Auth in sync" question this check needs to answer.
import { config } from "dotenv";
import path from "node:path";

// Must run before importing anything that reads process.env at module load
// time (lib/auth.ts's BETTER_AUTH_SECRET, @ai-catalyst/db's DATABASE_URL) —
// hence the dynamic imports below instead of static ones, which Node would
// otherwise evaluate before this call.
config({ path: path.resolve(__dirname, "../.env.local") });

async function main(): Promise<void> {
  const [{ getMigrations }, { pool }, { auth }] = await Promise.all([
    import("better-auth/db/migration"),
    import("@ai-catalyst/db"),
    import("../lib/auth"),
  ]);

  try {
    const { toBeCreated, toBeAdded } = await getMigrations(auth.options);

    if (toBeCreated.length === 0 && toBeAdded.length === 0) {
      console.log(
        "Better Auth's expected schema matches the database. No pending changes.",
      );
      return;
    }

    console.error("Better Auth's expected schema does not match the database:");
    for (const table of toBeCreated) {
      console.error(`  - missing table: ${table.table}`);
    }
    for (const table of toBeAdded) {
      console.error(
        `  - missing column(s) on ${table.table}: ${Object.keys(table.fields).join(", ")}`,
      );
    }
    console.error(
      "\nThis check never writes to the database. Add a new " +
        "infra/database/migrations/NNNN_description.sql migration that brings the " +
        "schema in line with lib/auth.ts, then run `pnpm db:migrate` and re-run this check.",
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
