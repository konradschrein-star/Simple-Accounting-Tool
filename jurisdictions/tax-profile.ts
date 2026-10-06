import type { Jurisdiction, VatFilingFrequency } from "./types"

export type TaxProfileInput = {
  taxRegistered: boolean
  smallBusinessExempt: boolean
  vatFilingFrequency: VatFilingFrequency
  vatPeriodEndMonth: number
  deDauerfrist: boolean
}

/**
 * The one rule for how tax answers translate into settings (used by onboarding and settings alike):
 * small-business exemption only where the jurisdiction has one, no filing schedule or tax rate when not registered.
 */
export function normalizeTaxProfile(jurisdiction: Jurisdiction, input: TaxProfileInput) {
  const smallBusinessExempt = !!jurisdiction.exemptIncomeCode && input.smallBusinessExempt
  const taxRegistered = input.taxRegistered && !smallBusinessExempt
  return {
    taxRegistered,
    smallBusinessExempt,
    vatFilingFrequency: taxRegistered ? input.vatFilingFrequency : ("none" as const),
    vatPeriodEndMonth: Math.min(3, Math.max(1, input.vatPeriodEndMonth)),
    deDauerfrist: taxRegistered && input.deDauerfrist,
    defaultTaxRateBp: taxRegistered ? jurisdiction.defaultTaxRateBp : 0,
  }
}

type ChargeProfile = { taxRegistered: boolean; smallBusinessExempt: boolean }

/** Rates a workspace may put on its own invoices: none (0) unless registered and not exempt. */
export function invoiceRatesBp(jurisdiction: Jurisdiction, profile: ChargeProfile): number[] {
  return profile.smallBusinessExempt || !profile.taxRegistered ? [0] : jurisdiction.taxRatesBp
}

/** Whether VAT/GST paid on expenses can be reclaimed (US sales tax has no input credit). */
export function reclaimsInputTax(jurisdiction: Jurisdiction, profile: ChargeProfile): boolean {
  return profile.taxRegistered && !profile.smallBusinessExempt && jurisdiction.chartOfAccounts.some((a) => (a.inputTaxBp ?? 0) > 0)
}
