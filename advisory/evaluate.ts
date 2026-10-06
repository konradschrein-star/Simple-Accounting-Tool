import type { Db } from "@/db/client"
import { getJurisdiction } from "@/jurisdictions"
import { todayIn } from "@/lib/dates"
import { env } from "@/lib/env"
import { expireTaxAlerts, metricInputs, persistAlerts } from "@/server/repos/advisory"
import { getSettings, taxProfileOf } from "@/server/repos/workspace"
import { computeMetrics, type Metrics } from "./metrics"
import { evaluateAlerts } from "./triggers"

export function workspaceMetrics(db: Db, orgId: string, today: string): Metrics {
  const inputs = metricInputs(db, orgId)
  return computeMetrics(inputs.invoices, inputs.transactions, today)
}

/** Re-evaluates advisory triggers for a workspace. Called after money-moving mutations and by the hourly sweep (time-based alerts). */
export function evaluateTriggers(db: Db, orgId: string): void {
  const settings = getSettings(db, orgId)
  if (!settings.jurisdiction) return
  const today = todayIn(settings.timezone)
  const metrics = workspaceMetrics(db, orgId, today)
  persistAlerts(
    db,
    orgId,
    evaluateAlerts({ metrics, jurisdiction: getJurisdiction(settings.jurisdiction), profile: taxProfileOf(settings), today, marginThresholdBp: env().MARGIN_ALERT_BP }),
  )
  expireTaxAlerts(db, orgId, today)
}
