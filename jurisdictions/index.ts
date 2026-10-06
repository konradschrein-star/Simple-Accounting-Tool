import { de } from "./de"
import { je } from "./je"
import { uk } from "./uk"
import { us } from "./us"
import type { Jurisdiction, JurisdictionCode } from "./types"

export * from "./types"

export const JURISDICTIONS: Record<JurisdictionCode, Jurisdiction> = { de, uk, us, je }

export function getJurisdiction(code: JurisdictionCode): Jurisdiction {
  return JURISDICTIONS[code]
}

/** The chart entry behind an account code, if the jurisdiction's template has it. */
export function accountTemplate(jurisdiction: Jurisdiction, accountCode: string) {
  return jurisdiction.chartOfAccounts.find((a) => a.code === accountCode)
}

/** Input tax usually contained in an expense booked to this account — 0 for accounts the template doesn't know (never over-claim). */
export function defaultInputTaxBp(jurisdiction: Jurisdiction, accountCode: string): number {
  return accountTemplate(jurisdiction, accountCode)?.inputTaxBp ?? 0
}
