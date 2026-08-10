import { Pool } from "pg";

// Destructive: drops and recreates entire `public` schema — no undo.
// Gated below; staging workflow adds a fourth GitHub Environment confirmation.
// Never run against a database you have not verified is the intended target.
function parseDatabaseName(connectionString: string): string {
  const url = new URL(connectionString);
  const name = url.pathname.replace(/^\//, "");
  if (!name) {
    throw new Error(
      "Could not parse a database name from DATABASE_URL's path.",
    );
  }
  return name;
}

export function assertResetGates(
  argv: string[],
  env: NodeJS.ProcessEnv,
  connectionString: string,
): { databaseName: string } {
  // Gate 1: explicit opt-in env var, separate from any CLI flag so it
  // can't be satisfied by a copy-pasted command alone.
  if (env.ALLOW_DESTRUCTIVE_DB_RESET !== "1") {
    throw new Error(
      "Refusing to reset: set ALLOW_DESTRUCTIVE_DB_RESET=1 to confirm.",
    );
  }

  const databaseName = parseDatabaseName(connectionString);

  // Gate 2: reject anything that even LOOKS like production. This is a
  // UX guard, not a safety boundary — it does not prove the target is
  // actually staging (see reset-staging-db.yml's GitHub Environment gate
  // for the real boundary) — but it catches the single most likely
  // mistake (DATABASE_URL pointed at prod by accident) for free.
  if (/prod/i.test(databaseName) || /prod/i.test(connectionString)) {
    throw new Error(
      `Refusing to reset: database name/connection string matches /prod[a-z]*/i ("${databaseName}"). ` +
        "If this genuinely is not production, this script cannot tell — verify manually and, if truly " +
        "necessary, rename the database or connect via a URL that doesn't match this pattern.",
    );
  }

  // Gate 3: the operator must type the exact database name being wiped —
  // catches "ALLOW_DESTRUCTIVE_DB_RESET=1 was left set from last time" and
  // "DATABASE_URL silently changed" the same way a delete confirmation
  // dialog that requires typing the resource's name does.
  const confirmIndex = argv.indexOf("--confirm-database");
  const confirmedName =
    confirmIndex !== -1 ? argv[confirmIndex + 1] : undefined;
  if (!confirmedName) {
    throw new Error(
      "Usage: ALLOW_DESTRUCTIVE_DB_RESET=1 tsx src/reset.ts -- --confirm-database <exact-database-name>",
    );
  }
  if (confirmedName !== databaseName) {
    throw new Error(
      `Refusing to reset: --confirm-database "${confirmedName}" does not exactly match the database name ` +
        `parsed from DATABASE_URL ("${databaseName}").`,
    );
  }

  return { databaseName };
}

async function run(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const { databaseName } = assertResetGates(
    process.argv.slice(2),
    process.env,
    connectionString,
  );

  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    console.log(
      `Dropping and recreating schema "public" on database "${databaseName}"...`,
    );
    await client.query("drop schema public cascade");
    // No explicit grants follow: 0001_aidb_v5_baseline.sql itself issues
    // none, relying on the connecting role owning the schema it creates —
    // exactly what CREATE SCHEMA gives the current role by default, so
    // this reproduces a genuinely fresh database's permission state
    // without guessing at a broader grant that might not match every
    // environment's actual role setup.
    await client.query("create schema public");
    console.log('Done. Run "pnpm db:migrate && pnpm db:seed" to rebuild.');
  } finally {
    client.release();
    await pool.end();
  }
}

// Only run when executed directly (`tsx src/reset.ts`), not when imported
// — assertResetGates is exported specifically so its guard logic can be
// unit-tested without ever reaching the drop/create statements above.
if (process.argv[1] && process.argv[1].endsWith("reset.ts")) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
