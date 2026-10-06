import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { nanoid } from "nanoid"
import { openDatabase, setDbForTests, type Db } from "@/db/client"
import { user } from "@/db/schema"

/** Fresh, fully migrated SQLite file per test file; also installed as the process-wide db. */
export function testDatabase(): Db {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cashflow-test-"))
  const db = openDatabase(path.join(dir, "test.db"))
  migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle") })
  setDbForTests(db)
  return db
}

export function createUser(db: Db, overrides: Partial<typeof user.$inferInsert> = {}): string {
  const id = nanoid()
  db.insert(user)
    .values({ id, name: "Test User", email: `${id}@test.local`, emailVerified: true, createdAt: new Date(), updatedAt: new Date(), role: "user", ...overrides })
    .run()
  return id
}
