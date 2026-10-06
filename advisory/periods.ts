import { z } from "zod"
import { addMonths, monthKey, monthRange, type IsoDate } from "@/lib/dates"
import type { Metrics, PeriodMetrics } from "./metrics"

/** The dashboard's period toggle: each period knows its label, where it starts, and its slice of the metrics. */
export const DASHBOARD_PERIODS = {
  month: { label: "This month", from: (today: IsoDate) => monthRange(monthKey(today)).from, pick: (m: Metrics): PeriodMetrics => m.thisMonth },
  year: {
    label: "Last 12 months",
    from: (today: IsoDate) => monthRange(addMonths(monthKey(today), -11)).from,
    pick: (m: Metrics): PeriodMetrics => m.trailing12,
  },
} as const

export type DashboardPeriod = keyof typeof DASHBOARD_PERIODS

/** Unknown or missing values fall back to the year view. */
export const dashboardPeriod = z.enum(["month", "year"]).catch("year")
