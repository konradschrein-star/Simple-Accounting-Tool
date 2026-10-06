import { recoverInterruptedImports } from "@/ingest/jobs"

let started = false

/** Runs once per server process (from instrumentation.ts). */
export function startBackgroundTasks() {
  if (started) return
  started = true
  try {
    recoverInterruptedImports()
  } catch (error) {
    // The DB may not be migrated yet on the very first boot; migrations run before the server in production.
    console.warn("[boot] import recovery skipped:", error instanceof Error ? error.message : error)
  }
}
