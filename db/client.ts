import fs from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import { env } from "@/lib/env"
import * as schema from "./schema"

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database }

let instance: Db | undefined

export function openDatabase(file: string): Db {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const sqlite = new Database(file)
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")
  sqlite.pragma("busy_timeout = 5000")
  sqlite.pragma("synchronous = NORMAL")
  return drizzle(sqlite, { schema }) as Db
}

export function databaseFile(): string {
  return path.resolve(env().DATA_DIR, "db", "app.db")
}

/** The process-wide connection, opened on first use (never at import time, so `next build` stays DB-free). */
export function getDb(): Db {
  instance ??= openDatabase(databaseFile())
  return instance
}

/** Test hook: swap the process-wide connection (e.g. for a temp-file DB). */
export function setDbForTests(db: Db | undefined) {
  instance = db
}

/** Lazy proxy so modules can `import { db }` without opening the database at import time. */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>
    const value = real[prop]
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value
  },
})
