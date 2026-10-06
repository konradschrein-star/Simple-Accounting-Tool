import type { ReturnLine, VatSummary } from "@/tax/vat-return"
import type { CurrencyCode } from "@/lib/money"
import type { IsoDate } from "@/lib/dates"

export const JURISDICTION_CODES = ["de", "uk", "us", "je"] as const
export type JurisdictionCode = (typeof JURISDICTION_CODES)[number]

export type VatFilingFrequency = "monthly" | "quarterly" | "none"

/** The subset of workspace settings that drives tax behaviour. */
export type TaxProfile = {
  taxRegistered: boolean
  smallBusinessExempt: boolean
  vatFilingFrequency: VatFilingFrequency
  /** Month (1–3) in which the first VAT/GST quarter ends — UK/JE stagger. */
  vatPeriodEndMonth: 1 | 2 | 3
  deDauerfrist: boolean
}

export type TaxDeadline = { id: string; date: IsoDate; title: string; detail: string }

/** Fields that must be present before an invoice can be finalized. */
export type InvoiceRequirement = "sellerAddress" | "clientAddress" | "sellerTaxId" | "serviceDate"

export type CsvRole = "date" | "description" | "counterparty" | "amount" | "debit" | "credit" | "balance" | "currency" | "indicator"

export type BankField = "iban" | "bic" | "sortCode" | "accountNumber" | "routingNumber"

export type LedgerAccountKind = "income" | "expense" | "transfer" | "owner" | "tax"
export type LedgerAccountTemplate = {
  code: string
  name: string
  kind: LedgerAccountKind
  taxLine: string | null
  /** Expenses: VAT/GST usually contained in a payment booked here (0 for wages, insurance, exempt rent, bank fees…). */
  inputTaxBp?: number
  /** Outside the scope of VAT (wages): left out of purchase totals on returns, not just untaxed. */
  outOfScope?: true
}

/** How a jurisdiction's VAT/GST/sales-tax return looks and when it applies. */
export type VatReturnForm = {
  name: string
  tabLabel: string
  /** Column header for box numbers ("Kz.", "Box", or none). */
  boxHeader: string
  baseHeader: string
  /** Appended to "Check the figures before you file…". */
  filingHint: string
  /** Fixed calendar quarters instead of the workspace's stagger (DE, US). */
  calendarQuarters: boolean
  /** Filing frequency regardless of settings. */
  frequency?: "quarterly"
  /** Only registered businesses file (sales tax is shown regardless). */
  requiresRegistration: boolean
  showsInputTax: boolean
  /** Deadline ids from `taxDeadlines` that belong to this return. */
  deadlineIdPrefix: string
  lines: (summary: VatSummary) => ReturnLine[]
}

export interface Jurisdiction {
  code: JurisdictionCode
  name: string
  /** ISO 3166-1 alpha-2, as e-invoices and payment formats need it. */
  countryCode: string
  /** Whether structured e-invoices (ZUGFeRD/XRechnung, EN 16931) are offered — a German B2B obligation. */
  eInvoicing: boolean
  currency: CurrencyCode
  locale: string
  timezone: string
  taxLabel: string
  taxIdLabel: string
  taxRatesBp: number[]
  defaultTaxRateBp: number
  invoiceLanguage: "de" | "en"
  bankFields: BankField[]
  milestoneThresholdMinor: number
  csvSynonyms: Partial<Record<CsvRole, string[]>>
  chartOfAccounts: LedgerAccountTemplate[]
  /** Income account used for tax-exempt small businesses (e.g. DE §19), if the chart has one. */
  exemptIncomeCode?: string
  vatReturn: VatReturnForm
  requiredInvoiceFields(profile: TaxProfile): InvoiceRequirement[]
  /** Note printed on invoices that carry no tax (e.g. §19 UStG), or null. */
  exemptionNote(profile: TaxProfile): string | null
  /** Upcoming filing/payment deadlines in [from, to], sorted ascending. */
  taxDeadlines(profile: TaxProfile, from: IsoDate, to: IsoDate): TaxDeadline[]
}
