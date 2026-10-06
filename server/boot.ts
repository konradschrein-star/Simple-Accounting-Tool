import path from "node:path"
import { db } from "@/db/client"
import { cleanupExpiredDemos } from "@/demo/cleanup"
import { recoverInterruptedImports } from "@/ingest/jobs"
import { env } from "@/lib/env"

let started = false

function safely(name: string, task: () => void) {
  try {
    task()
  } catch (error) {
    // On the very first boot the DB may not be migrated yet; production runs migrations before the server.
    console.warn(`[boot] ${name} skipped:`, error instanceof Error ? error.message : error)
  }
}

/** Runs once per server process (from instrumentation.ts). */
export function startBackgroundTasks() {
  if (started) return
  started = true
  safely("import recovery", recoverInterruptedImports)
  const sweep = () => safely("demo cleanup", () => cleanupExpiredDemos(db, path.resolve(env().DATA_DIR)))
  sweep()
  setInterval(sweep, 60 * 60 * 1000).unref()
}
