import type { Jurisdiction, TaxProfile } from "@/jurisdictions"
import { addDays, daysBetween, monthKey, type IsoDate } from "@/lib/dates"
import type { Metrics } from "./metrics"

export type AlertType = "milestone_lifetime" | "milestone_month" | "margin_low" | "tax_deadline"
export type TriggeredAlert = { type: AlertType; dedupeKey: string; payload: Record<string, unknown> }

export const TAX_ALERT_WINDOW_DAYS = 21
export const MIN_HISTORY_DAYS = 30

/**
 * Pure trigger evaluation. Every alert carries a period-scoped dedupe key so it fires at most once per
 * period; the caller persists with insert-or-ignore.
 */
export function evaluateAlerts(input: {
  metrics: Metrics
  jurisdiction: Jurisdiction
  profile: TaxProfile
  today: IsoDate
  marginThresholdBp: number
}): TriggeredAlert[] {
  const { metrics, jurisdiction, profile, today, marginThresholdBp } = input
  const threshold = jurisdiction.milestoneThresholdMinor
  const alerts: TriggeredAlert[] = []

  if (metrics.lifetime.invoicedMinor >= threshold)
    alerts.push({
      type: "milestone_lifetime",
      dedupeKey: "milestone:lifetime",
      payload: { invoicedMinor: metrics.lifetime.invoicedMinor, thresholdMinor: threshold },
    })

  for (const m of metrics.months.slice(-2)) {
    if (m.invoicedMinor >= threshold)
      alerts.push({
        type: "milestone_month",
        dedupeKey: `milestone:month:${m.month}`,
        payload: { month: m.month, invoicedMinor: m.invoicedMinor, thresholdMinor: threshold },
      })
  }

  const t90 = metrics.trailing90
  const enoughHistory = metrics.firstActivity !== null && daysBetween(metrics.firstActivity, today) >= MIN_HISTORY_DAYS
  if (enoughHistory && t90.cashInMinor > 0 && t90.marginBp !== null && t90.marginBp < marginThresholdBp)
    alerts.push({
      type: "margin_low",
      dedupeKey: `margin:${monthKey(today)}`,
      payload: { marginBp: t90.marginBp, thresholdBp: marginThresholdBp, cashInMinor: t90.cashInMinor, expensesMinor: t90.expensesMinor },
    })

  for (const deadline of jurisdiction.taxDeadlines(profile, today, addDays(today, TAX_ALERT_WINDOW_DAYS)))
    alerts.push({ type: "tax_deadline", dedupeKey: `tax:${deadline.id}`, payload: { ...deadline, daysLeft: daysBetween(today, deadline.date) } })

  return alerts
}

const PRIORITY: Record<AlertType, number> = { margin_low: 0, tax_deadline: 1, milestone_month: 2, milestone_lifetime: 3 }

/** What deserves the user's attention first: risk, then deadlines, then the newest milestone. Older milestone months are redundant. */
export function rankAlerts<T extends { type: AlertType; dedupeKey: string }>(alerts: T[], limit = 2): { shown: T[]; hidden: number } {
  const newestMonth = alerts.filter((a) => a.type === "milestone_month").sort((a, b) => b.dedupeKey.localeCompare(a.dedupeKey))[0]
  const relevant = alerts.filter((a) => a.type !== "milestone_month" || a === newestMonth).sort((a, b) => PRIORITY[a.type] - PRIORITY[b.type])
  return { shown: relevant.slice(0, limit), hidden: Math.max(0, relevant.length - limit) }
}
