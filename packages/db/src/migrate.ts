import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";

// Resolved from this module's own location, not process.cwd(), so
// `pnpm --filter @ai-catalyst/db run migrate` behaves the same regardless of
// the directory it's invoked from.
const migrationsDirectory = fileURLToPath(
  new URL("../../../infra/database/migrations/", import.meta.url),
);

// Fixed, documented advisory lock key for this database's migration runner.
// Any value works as long as every runner instance for this DB uses the same
// one; picked arbitrarily and should never change once in use.
const LOCK_KEY = 727_310_001;

interface MigrationFile {
  version: string;
  filePath: string;
  sql: string;
  checksum: string;
}

function checksumOf(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

async function loadMigrationFiles(): Promise<MigrationFile[]> {
  const entries = await readdir(migrationsDirectory);
  const sqlFiles = entries.filter((entry) => entry.endsWith(".sql")).sort();

  return Promise.all(
    sqlFiles.map(async (fileName) => {
      const filePath = path.join(migrationsDirectory, fileName);
      const sql = await readFile(filePath, "utf8");
      return {
        version: fileName.replace(/\.sql$/, ""),
        filePath,
        sql,
        checksum: checksumOf(sql),
      };
    }),
  );
}

async function ensureMigrationTable(client: PoolClient): Promise<void> {
  await client.query(`
    create table if not exists schema_migrations (
      version text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    );
  `);
}

async function loadAppliedMigrations(
  client: PoolClient,
): Promise<Map<string, string>> {
  const result = await client.query<{ version: string; checksum: string }>(
    "select version, checksum from schema_migrations",
  );
  return new Map(result.rows.map((row) => [row.version, row.checksum]));
}

function validateAppliedChecksums(
  migrations: MigrationFile[],
  applied: Map<string, string>,
): void {
  for (const migration of migrations) {
    const appliedChecksum = applied.get(migration.version);
    if (appliedChecksum !== undefined && appliedChecksum !== migration.checksum) {
      throw new Error(
        `Migration ${migration.version} has already been applied but its checksum has changed. ` +
          "Applied migrations must never be edited — create a new migration file instead.",
      );
    }
  }
}

async function applyMigration(
  client: PoolClient,
  migration: MigrationFile,
): Promise<void> {
  await client.query("begin");
  try {
    await client.query(migration.sql);
    await client.query(
      "insert into schema_migrations(version, checksum) values ($1, $2)",
      [migration.version, migration.checksum],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function run(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  // Deliberately a standalone pool/client, not the shared singleton exported
  // from pool.ts: this CLI is short-lived and must call pool.end() on exit,
  // which would be the wrong lifecycle for the hot-reload-cached pool that
  // long-running consumers (apps/web) rely on.
  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    // pg_advisory_lock is session-scoped, so the lock, the schema_migrations
    // bookkeeping, the checksum validation, and every migration transaction
    // must all run on this same client — acquiring the lock on one pooled
    // connection while migrating on another would make it meaningless.
    await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);

    await ensureMigrationTable(client);

    const migrations = await loadMigrationFiles();
    const applied = await loadAppliedMigrations(client);

    validateAppliedChecksums(migrations, applied);

    const pending = migrations.filter((migration) => !applied.has(migration.version));

    if (pending.length === 0) {
      console.log("No pending migrations.");
      return;
    }

    for (const migration of pending) {
      console.log(`Applying ${migration.version}...`);
      await applyMigration(client, migration);
      console.log(`Applied ${migration.version}.`);
    }
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK_KEY]);
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
