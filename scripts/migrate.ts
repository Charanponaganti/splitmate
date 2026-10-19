import "dotenv/config";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: ".env.local", override: false });

/**
 * Applies SQL migrations from ./drizzle. For a hosted Postgres run this during
 * deployment. The embedded local database (PGlite) migrates itself on start,
 * so this script also supports it for convenience.
 */
async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url || url.startsWith("pglite:")) {
    const { getDb, closeDb } = await import("../src/lib/db");
    await getDb();
    await closeDb();
    console.log("Local embedded database is migrated.");
    return;
  }
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
    console.log("Migrations applied.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
