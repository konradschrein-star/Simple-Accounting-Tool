// Applies pending Drizzle migrations. Runs at container start (plain node, no tsx/drizzle-kit needed).
import fs from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"

const file = path.resolve(process.env.DATA_DIR ?? "./data", "db", "app.db")
fs.mkdirSync(path.dirname(file), { recursive: true })
const sqlite = new Database(file)
sqlite.pragma("journal_mode = WAL")
migrate(drizzle(sqlite), { migrationsFolder: path.resolve(process.env.MIGRATIONS_DIR ?? "./drizzle") })
sqlite.close()
console.log(`[migrate] up to date: ${file}`)
