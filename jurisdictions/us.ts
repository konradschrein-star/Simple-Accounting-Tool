import { isoOf, nextBusinessDay } from "@/lib/dates"
import { collectDeadlines } from "./deadlines"
import { usHolidays } from "./holidays"
import { englishCsvSynonyms } from "./uk"
import type { Jurisdiction, TaxDeadline, VatReturnForm } from "./types"

const shift = (iso: string) => nextBusinessDay(iso, usHolidays)

function perYear(year: number): TaxDeadline[] {
  return [
    {
      id: `us-1040-${year - 1}`,
      date: shift(isoOf(year, 4, 15)),
      title: `Tax return ${year - 1} + Q1 estimated tax`,
      detail: `Form 1040 for ${year - 1} and the first 1040-ES estimated payment for ${year}.`,
    },
    { id: `us-es-${year}-q2`, date: shift(isoOf(year, 6, 15)), title: "Q2 estimated tax", detail: `1040-ES payment 2 for ${year}.` },
    { id: `us-es-${year}-q3`, date: shift(isoOf(year, 9, 15)), title: "Q3 estimated tax", detail: `1040-ES payment 3 for ${year}.` },
    {
      id: `us-es-${year - 1}-q4`,
      date: shift(isoOf(year, 1, 15)),
      title: "Q4 estimated tax",
      detail: `1040-ES payment 4 for ${year - 1}.`,
    },
  ]
}

/** Sales tax is filed per state on its own calendar; quarterly summaries cover the common case. No input credit. */
const vatReturn: VatReturnForm = {
  name: "Sales tax summary",
  tabLabel: "Sales tax",
  boxHeader: "",
  baseHeader: "Value",
  filingHint: "",
  calendarQuarters: true,
  frequency: "quarterly",
  requiresRegistration: false,
  showsInputTax: false,
  deadlineIdPrefix: "us-sales-tax",
  lines: (s) => [
    ...s.sales.map((g) => ({
      key: `rate-${g.rateBp}`,
      box: null,
      label: g.rateBp ? `Taxable sales at ${g.rateBp / 100} %` : "Non-taxable / exempt sales",
      baseMinor: g.netMinor,
      taxMinor: g.rateBp ? g.taxMinor : null,
    })),
    { key: "collected", box: null, label: "Sales tax collected — to remit to your state", baseMinor: s.salesNetMinor, taxMinor: s.outputTaxMinor, total: true },
  ],
}

export const us: Jurisdiction = {
  code: "us",
  countryCode: "US",
  eInvoicing: false,
  name: "United States",
  currency: "USD",
  locale: "en-US",
  timezone: "America/New_York",
  taxLabel: "Sales tax",
  taxIdLabel: "EIN",
  taxRatesBp: [0],
  defaultTaxRateBp: 0,
  invoiceLanguage: "en",
  bankFields: ["routingNumber", "accountNumber"],
  milestoneThresholdMinor: 1_000_000,
  csvSynonyms: englishCsvSynonyms,
  chartOfAccounts: [
    { code: "4000", name: "Gross receipts", kind: "income", taxLine: "Schedule C Line 1: Gross receipts" },
    { code: "4900", name: "Other income", kind: "income", taxLine: "Schedule C Line 6: Other income" },
    { code: "5000", name: "Cost of goods sold", kind: "expense", taxLine: "Schedule C Line 4: Cost of goods sold", inputTaxBp: 0 },
    { code: "6080", name: "Advertising", kind: "expense", taxLine: "Schedule C Line 8: Advertising", inputTaxBp: 0 },
    { code: "6090", name: "Car & truck expenses", kind: "expense", taxLine: "Schedule C Line 9: Car and truck", inputTaxBp: 0 },
    { code: "6100", name: "Commissions & fees", kind: "expense", taxLine: "Schedule C Line 10: Commissions and fees", inputTaxBp: 0 },
    { code: "6110", name: "Contract labor", kind: "expense", taxLine: "Schedule C Line 11: Contract labor", inputTaxBp: 0 },
    { code: "6150", name: "Insurance", kind: "expense", taxLine: "Schedule C Line 15: Insurance", inputTaxBp: 0 },
    { code: "6160", name: "Interest", kind: "expense", taxLine: "Schedule C Line 16b: Interest (other)", inputTaxBp: 0 },
    { code: "6170", name: "Legal & professional services", kind: "expense", taxLine: "Schedule C Line 17: Legal and professional", inputTaxBp: 0 },
    { code: "6180", name: "Office expense & software", kind: "expense", taxLine: "Schedule C Line 18: Office expense", inputTaxBp: 0 },
    { code: "6200", name: "Rent", kind: "expense", taxLine: "Schedule C Line 20b: Rent (other property)", inputTaxBp: 0 },
    { code: "6210", name: "Repairs & maintenance", kind: "expense", taxLine: "Schedule C Line 21: Repairs", inputTaxBp: 0 },
    { code: "6220", name: "Supplies", kind: "expense", taxLine: "Schedule C Line 22: Supplies", inputTaxBp: 0 },
    { code: "6230", name: "Taxes & licenses", kind: "expense", taxLine: "Schedule C Line 23: Taxes and licenses", inputTaxBp: 0 },
    { code: "6240", name: "Travel", kind: "expense", taxLine: "Schedule C Line 24a: Travel", inputTaxBp: 0 },
    { code: "6245", name: "Meals (50%)", kind: "expense", taxLine: "Schedule C Line 24b: Meals", inputTaxBp: 0 },
    { code: "6250", name: "Utilities", kind: "expense", taxLine: "Schedule C Line 25: Utilities", inputTaxBp: 0 },
    { code: "6260", name: "Wages", kind: "expense", taxLine: "Schedule C Line 26: Wages", inputTaxBp: 0, outOfScope: true },
    { code: "6270", name: "Bank fees", kind: "expense", taxLine: "Schedule C Line 27a: Other expenses", inputTaxBp: 0 },
    { code: "6900", name: "Other expenses", kind: "expense", taxLine: "Schedule C Line 27a: Other expenses", inputTaxBp: 0 },
    { code: "2200", name: "Sales tax remitted", kind: "tax", taxLine: null },
    { code: "1200", name: "Transfers between own accounts", kind: "transfer", taxLine: null },
    { code: "3000", name: "Owner draws (incl. estimated tax)", kind: "owner", taxLine: null },
    { code: "3100", name: "Owner contributions", kind: "owner", taxLine: null },
  ],
  vatReturn,
  settingsLabels: {
    taxNumber: "EIN",
    vatId: "Sales tax permit",
    vatAccounting: "Sales tax accounting",
    accrual: "Accrual (on invoice date)",
    cash: "Cash basis (on payment)",
    smallBusinessExemption: null,
    filingExtension: null,
  },
  requiredInvoiceFields: () => ["sellerAddress", "clientAddress"],
  exemptionNote: () => null,
  taxDeadlines: (_profile, from, to) => collectDeadlines(from, to, perYear),
}
