import { and, desc, eq, gte, lte } from "drizzle-orm"
import { z } from "zod"
import type { Db } from "@/db/client"
import { fxRates } from "@/db/schema"
import { DomainError } from "@/lib/action-result"
import { addDays, type IsoDate } from "@/lib/dates"

const ONE = 1_000_000

const frankfurterSchema = z.object({ date: z.string(), rates: z.record(z.string(), z.number()) })

/** Fetches the ECB reference rates (per 1 EUR) for a day via Frankfurter and caches them. */
async function fetchRates(db: Db, date: IsoDate): Promise<void> {
  const response = await fetch(`https://api.frankfurter.dev/v1/${date}?base=EUR`, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error(`Frankfurter ${response.status}`)
  const data = frankfurterSchema.parse(await response.json())
  // The ECB publishes on working days; Frankfurter answers with the latest available date.
  db.insert(fxRates)
    .values(Object.entries({ ...data.rates, EUR: 1 }).map(([currency, rate]) => ({ date: data.date, currency, ratePerEurMicro: Math.round(rate * ONE) })))
    .onConflictDoNothing()
    .run()
}

function cachedRate(db: Db, currency: string, date: IsoDate): number | null {
  if (currency === "EUR") return ONE
  return (
    db
      .select({ rate: fxRates.ratePerEurMicro })
      .from(fxRates)
      // Weekends and holidays have no ECB fixing; anything older than a week means we have to fetch.
      .where(and(eq(fxRates.currency, currency), lte(fxRates.date, date), gte(fxRates.date, addDays(date, -7))))
      .orderBy(desc(fxRates.date))
      .get()?.rate ?? null
  )
}

/**
 * Units of `to` per 1 unit of `from` on `date`, ×1e6 — e.g. a GBP invoice in a EUR workspace.
 * Locked into the invoice at finalize so reports never shift with later rate moves.
 */
export async function exchangeRateMicro(db: Db, from: string, to: string, date: IsoDate): Promise<number> {
  if (from === to) return ONE
  let fromRate = cachedRate(db, from, date)
  let toRate = cachedRate(db, to, date)
  if (fromRate === null || toRate === null) {
    try {
      await fetchRates(db, date)
    } catch (error) {
      console.warn("[fx] rate fetch failed", error instanceof Error ? error.message : error)
    }
    fromRate = cachedRate(db, from, date)
    toRate = cachedRate(db, to, date)
  }
  if (fromRate === null || toRate === null) throw new DomainError(`No ${from}/${to} exchange rate available right now — please try again shortly.`)
  return Math.round((toRate * ONE) / fromRate)
}
