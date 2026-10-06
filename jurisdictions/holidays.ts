import { addDays, easterSunday, fromIso, isoOf, nthWeekday, type IsoDate } from "@/lib/dates"

const cache = new Map<string, Set<IsoDate>>()

function memo(key: string, build: () => IsoDate[]): Set<IsoDate> {
  let set = cache.get(key)
  if (!set) {
    set = new Set(build())
    cache.set(key, set)
  }
  return set
}

/** German nationwide public holidays (relevant for §108 AO deadline shifting). */
export function germanHolidays(year: number): Set<IsoDate> {
  return memo(`de-${year}`, () => {
    const easter = easterSunday(year)
    return [
      isoOf(year, 1, 1),
      addDays(easter, -2),
      addDays(easter, 1),
      isoOf(year, 5, 1),
      addDays(easter, 39),
      addDays(easter, 50),
      isoOf(year, 10, 3),
      isoOf(year, 12, 25),
      isoOf(year, 12, 26),
    ]
  })
}

/** Saturday holidays are observed Friday, Sunday holidays Monday. */
function observed(iso: IsoDate): IsoDate {
  const day = fromIso(iso).getUTCDay()
  return day === 6 ? addDays(iso, -1) : day === 0 ? addDays(iso, 1) : iso
}

/** US federal holidays plus DC Emancipation Day (which moves the IRS April deadline). */
export function usHolidays(year: number): Set<IsoDate> {
  return memo(`us-${year}`, () => [
    observed(isoOf(year, 1, 1)),
    nthWeekday(year, 1, 1, 3),
    nthWeekday(year, 2, 1, 3),
    observed(isoOf(year, 4, 16)),
    nthWeekday(year, 5, 1, -1),
    observed(isoOf(year, 6, 19)),
    observed(isoOf(year, 7, 4)),
    nthWeekday(year, 9, 1, 1),
    nthWeekday(year, 10, 1, 2),
    observed(isoOf(year, 11, 11)),
    nthWeekday(year, 11, 4, 4),
    observed(isoOf(year, 12, 25)),
  ])
}
