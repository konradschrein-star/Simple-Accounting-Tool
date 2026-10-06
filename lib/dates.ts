/** Calendar dates are ISO "YYYY-MM-DD" strings. All arithmetic is done in UTC to avoid DST drift. */

export type IsoDate = string

const pad = (n: number) => String(n).padStart(2, "0")

export function toIso(d: Date): IsoDate {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function fromIso(iso: IsoDate): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function isoOf(year: number, month1: number, day: number): IsoDate {
  return toIso(new Date(Date.UTC(year, month1 - 1, day)))
}

/** Today's calendar date in the given IANA timezone. The only place that reads the clock for "today". */
export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  return `${get("year")}-${get("month")}-${get("day")}`
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const d = fromIso(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return toIso(d)
}

/** Last day of the month that is `offset` months after `month1` of `year`. */
export function lastDayOfMonth(year: number, month1: number, offset = 0): IsoDate {
  return toIso(new Date(Date.UTC(year, month1 - 1 + offset + 1, 0)))
}

/** Day `day` of the month `offset` months after (year, month1). */
export function dayOfMonth(year: number, month1: number, day: number, offset = 0): IsoDate {
  return toIso(new Date(Date.UTC(year, month1 - 1 + offset, day)))
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((fromIso(to).getTime() - fromIso(from).getTime()) / 86_400_000)
}

export function isWeekend(iso: IsoDate): boolean {
  const day = fromIso(iso).getUTCDay()
  return day === 0 || day === 6
}

export function monthKey(iso: IsoDate): string {
  return iso.slice(0, 7)
}

/** n-th weekday (0=Sun..6=Sat) of a month; n = -1 means last. */
export function nthWeekday(year: number, month1: number, weekday: number, n: number): IsoDate {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month1 - 1, 1)).getUTCDay()
    return isoOf(year, month1, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7)
  }
  const last = fromIso(lastDayOfMonth(year, month1))
  const back = (last.getUTCDay() - weekday + 7) % 7
  return addDays(toIso(last), -back)
}

/** Gregorian Easter Sunday (Anonymous Gregorian algorithm). */
export function easterSunday(year: number): IsoDate {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return isoOf(year, month, day)
}

/** Moves a date forward to the next day that is neither a weekend nor in `holidays`. */
export function nextBusinessDay(iso: IsoDate, holidays: (year: number) => Set<IsoDate>): IsoDate {
  let date = iso
  while (isWeekend(date) || holidays(Number(date.slice(0, 4))).has(date)) date = addDays(date, 1)
  return date
}

export function formatDate(iso: IsoDate | null | undefined, locale: string, style: "medium" | "short" = "medium"): string {
  if (!iso) return "—"
  return new Intl.DateTimeFormat(locale, { dateStyle: style, timeZone: "UTC" }).format(fromIso(iso))
}

/** UI copy is English, so month names are too (numbers and dates keep the workspace locale). */
export function monthLabel(month: string, style: "long" | "short" = "long"): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: style, year: style === "long" ? "numeric" : "2-digit", timeZone: "UTC" })
}
