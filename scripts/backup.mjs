// Nightly backup: consistent SQLite snapshot (online backup API) + uploads/pdfs tarball, 14-day retention.
// Usage on the host: docker compose exec -T app node scripts/backup.mjs
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"

const dataDir = path.resolve(process.env.DATA_DIR ?? "./data")
const outDir = path.join(dataDir, "backups")
const stamp = new Date().toISOString().slice(0, 10)
fs.mkdirSync(outDir, { recursive: true })

const db = new Database(path.join(dataDir, "db", "app.db"), { readonly: true })
await db.backup(path.join(outDir, `app-${stamp}.db`))
db.close()

const dirs = ["uploads", "pdfs"].filter((d) => fs.existsSync(path.join(dataDir, d)))
if (dirs.length) execFileSync("tar", ["-czf", path.join(outDir, `files-${stamp}.tar.gz`), "-C", dataDir, ...dirs])

const cutoff = Date.now() - 14 * 86_400_000
for (const f of fs.readdirSync(outDir)) {
  const p = path.join(outDir, f)
  if (fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p)
}
console.log(`[backup] ${stamp} written to ${outDir}`)
