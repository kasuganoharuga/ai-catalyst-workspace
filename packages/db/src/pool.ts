import { Pool } from "pg";

// Next.js dev hot-reload re-evaluates this module on every edit; without the
// globalThis cache each reload would leak a new Pool instead of reusing one.
const globalForDatabase = globalThis as typeof globalThis & {
  aiCatalystPool?: Pool;
};

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString });

  pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL pool error", error);
  });

  return pool;
}

export const pool = globalForDatabase.aiCatalystPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.aiCatalystPool = pool;
}
