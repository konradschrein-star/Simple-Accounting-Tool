import path from "node:path"
import { evaluateTriggers } from "@/advisory/evaluate"
import { db } from "@/db/client"
import { onboardedWorkspaceIds } from "@/server/repos/workspace"
import { cleanupExpiredDemos } from "@/demo/cleanup"
import { recoverInterruptedImports } from "@/ingest/jobs"
import { runPaymentReminders, runRecurringInvoices } from "@/invoicing/service"
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

let billing: Promise<void> | null = null

/** Recurring invoices first (they may become overdue later), then reminders. Never overlaps itself. */
function runBilling() {
  billing ??= (async () => {
    for (const [name, job] of [
      ["recurring invoices", runRecurringInvoices],
      ["payment reminders", runPaymentReminders],
    ] as const) {
      try {
        const count = await job(db)
        if (count) console.info(`[boot] ${name}: ${count}`)
      } catch (error) {
        console.warn(`[boot] ${name} failed:`, error instanceof Error ? error.message : error)
      }
    }
  })().finally(() => {
    billing = null
  })
}

/** Runs once per server process (from instrumentation.ts). */
export function startBackgroundTasks() {
  if (started) return
  started = true
  safely("import recovery", recoverInterruptedImports)
  const sweep = () => {
    safely("demo cleanup", () => cleanupExpiredDemos(db, path.resolve(env().DATA_DIR)))
    safely("alert sweep", () => onboardedWorkspaceIds(db).forEach((orgId) => evaluateTriggers(db, orgId)))
    runBilling()
  }
  sweep()
  setInterval(sweep, 60 * 60 * 1000).unref()
}
