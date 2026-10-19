import "server-only";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

type Listener = (channel: string, callback: (payload: string) => void) => Promise<unknown>;

interface DbHandle {
  db: Db;
  kind: "pglite" | "postgres";
  listen: Listener;
  close: () => Promise<void>;
  ready: Promise<void>;
}

const globalForDb = globalThis as unknown as { __splitmateDb?: DbHandle };

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

function resolveConfig(): { kind: "pglite"; dataDir: string | null } | { kind: "postgres"; url: string } {
  const url = process.env.DATABASE_URL?.trim();
  if (!url || url.startsWith("pglite:")) {
    const location = url ? url.slice("pglite:".length) : "./.data/pglite";
    if (location === "memory" || location === "") return { kind: "pglite", dataDir: null };
    return { kind: "pglite", dataDir: path.resolve(/*turbopackIgnore: true*/ process.cwd(), location) };
  }
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    return { kind: "postgres", url };
  }
  throw new Error("DATABASE_URL must be a postgres:// URL or pglite:<path>.");
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * PGlite stores data in a folder that must only be opened by one process at a
 * time. A pid lock file turns accidental concurrent access (e.g. running the
 * seed script while `next dev` is up) into a clear error instead of corruption.
 */
function acquireDataDirLock(dataDir: string) {
  fs.mkdirSync(dataDir, { recursive: true });
  const lockFile = `${dataDir}.lock`;
  if (fs.existsSync(lockFile)) {
    const pid = Number(fs.readFileSync(lockFile, "utf8"));
    if (pid && pid !== process.pid && processIsAlive(pid)) {
      throw new Error(
        `The local database at ${dataDir} is in use by another process (pid ${pid}). ` +
          "Stop the dev server before running database scripts.",
      );
    }
  }
  fs.writeFileSync(lockFile, String(process.pid));
  const release = () => {
    try {
      if (fs.readFileSync(lockFile, "utf8") === String(process.pid)) fs.unlinkSync(lockFile);
    } catch {
      /* already released */
    }
  };
  process.once("exit", release);
  return release;
}

function createHandle(): DbHandle {
  const config = resolveConfig();

  if (config.kind === "postgres") {
    const client = postgres(config.url, {
      max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
      prepare: process.env.DATABASE_DISABLE_PREPARE !== "true",
      onnotice: () => {},
    });
    const db = drizzlePostgres({ client, schema }) as unknown as Db;
    return {
      db,
      kind: "postgres",
      listen: (channel, callback) => client.listen(channel, callback),
      close: () => client.end(),
      ready: Promise.resolve(),
    };
  }

  const release = config.dataDir ? acquireDataDirLock(config.dataDir) : () => {};
  const client = config.dataDir ? new PGlite(config.dataDir) : new PGlite();
  const pgliteDb = drizzlePglite({ client, schema });
  // The embedded database migrates itself so local development needs no setup.
  const ready = migratePglite(pgliteDb, { migrationsFolder: MIGRATIONS_FOLDER });
  return {
    db: pgliteDb as unknown as Db,
    kind: "pglite",
    listen: (channel, callback) => client.listen(channel, callback),
    close: async () => {
      await client.close();
      release();
    },
    ready,
  };
}

function getHandle(): DbHandle {
  if (!globalForDb.__splitmateDb) globalForDb.__splitmateDb = createHandle();
  return globalForDb.__splitmateDb;
}

/** Returns the database once it is ready to serve queries (migrated, connected). */
export async function getDb(): Promise<Db> {
  const handle = getHandle();
  await handle.ready;
  return handle.db;
}

/** Synchronous access for libraries (Better Auth) that need the instance up front. */
export function getDbSync(): Db {
  return getHandle().db;
}

export async function waitForDb(): Promise<void> {
  await getHandle().ready;
}

export function getDbKind(): "pglite" | "postgres" {
  return resolveConfig().kind;
}

export function listen(channel: string, callback: (payload: string) => void) {
  return getHandle().listen(channel, callback);
}

export async function closeDb(): Promise<void> {
  const handle = globalForDb.__splitmateDb;
  if (!handle) return;
  globalForDb.__splitmateDb = undefined;
  await handle.close();
}

export { schema };
