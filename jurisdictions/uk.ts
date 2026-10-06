import { wholeUnits } from "@/tax/vat-return"
import { dayOfMonth, isoOf } from "@/lib/dates"
import { collectDeadlines, pad2, quarterEndMonths } from "./deadlines"
import type { Jurisdiction, TaxDeadline, TaxProfile, VatReturnForm } from "./types"

/** Shared by UK and Jersey: banks there export the same English-language CSV shapes. */
export const englishCsvSynonyms: Jurisdiction["csvSynonyms"] = {
  date: ["date", "transaction date", "posting date", "booking date", "value date", "posted date", "trans. date"],
  description: ["description", "details", "memo", "narrative", "transaction description", "reference", "notes"],
  counterparty: ["payee", "name", "merchant", "counterparty", "beneficiary", "payer"],
  amount: ["amount", "value", "transaction amount", "amount (gbp)", "amount (usd)", "amount (eur)"],
  debit: ["debit", "paid out", "money out", "withdrawal", "withdrawals", "debit amount", "out"],
  credit: ["credit", "paid in", "money in", "deposit", "deposits", "credit amount", "in"],
  balance: ["balance", "running balance", "available balance"],
  currency: ["currency", "local currency"],
  indicator: ["type", "dr/cr", "debit/credit", "transaction type", "cr/dr"],
}

function perYear(profile: TaxProfile, year: number): TaxDeadline[] {
  const deadlines: TaxDeadline[] = [
    {
      id: `uk-sa-jan-${year}`,
      date: isoOf(year, 1, 31),
      title: "Self Assessment deadline",
      detail: `Online return for ${year - 2}-${String(year - 1).slice(2)}, balancing payment and 1st payment on account.`,
    },
    {
      id: `uk-sa-jul-${year}`,
      date: isoOf(year, 7, 31),
      title: "2nd payment on account",
      detail: "Self Assessment second payment on account.",
    },
    ...[2, 5, 8, 11].map((month) => ({
      id: `uk-mtd-${year}-${pad2(month)}`,
      date: isoOf(year, month, 7),
      title: "MTD quarterly update",
      detail: "Making Tax Digital for Income Tax quarterly update (if enrolled).",
    })),
  ]
  if (profile.taxRegistered && profile.vatFilingFrequency !== "none") {
    const ends = profile.vatFilingFrequency === "monthly" ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : quarterEndMonths(profile.vatPeriodEndMonth)
    for (const month of ends) {
      deadlines.push({
        id: `uk-vat-${year}-${pad2(month)}`,
        date: dayOfMonth(year, month, 7, 2),
        title: "VAT return & payment",
        detail: `VAT period ending ${year}-${pad2(month)} (1 month + 7 days).`,
      })
    }
  }
  return deadlines
}

/** HMRC's nine boxes; boxes 2, 8 and 9 only concern Northern Ireland trade with the EU. */
const vatReturn: VatReturnForm = {
  name: "VAT return",
  tabLabel: "VAT return",
  boxHeader: "Box",
  baseHeader: "Value",
  filingHint: " through MTD-compatible software",
  calendarQuarters: false,
  requiresRegistration: true,
  showsInputTax: true,
  deadlineIdPrefix: "uk-vat",
  lines: (s) => [
    { key: "1", box: "1", label: "VAT due on sales and other outputs", baseMinor: null, taxMinor: s.outputTaxMinor },
    { key: "2", box: "2", label: "VAT due on acquisitions from the EU (Northern Ireland only)", baseMinor: null, taxMinor: 0 },
    { key: "3", box: "3", label: "Total VAT due (boxes 1 + 2)", baseMinor: null, taxMinor: s.outputTaxMinor },
    { key: "4", box: "4", label: "VAT reclaimed on purchases and other inputs", baseMinor: null, taxMinor: s.inputTaxMinor },
    {
      key: "5",
      box: "5",
      label: s.netTaxMinor >= 0 ? "Net VAT to pay to HMRC" : "Net VAT to reclaim from HMRC",
      baseMinor: null,
      taxMinor: Math.abs(s.netTaxMinor),
      total: true,
    },
    { key: "6", box: "6", label: "Total value of sales and outputs, excluding VAT", baseMinor: wholeUnits(s.salesNetMinor), taxMinor: null },
    { key: "7", box: "7", label: "Total value of purchases and inputs, excluding VAT", baseMinor: wholeUnits(s.purchasesNetMinor), taxMinor: null },
    { key: "8", box: "8", label: "Supplies of goods to the EU (Northern Ireland only)", baseMinor: 0, taxMinor: null },
    { key: "9", box: "9", label: "Acquisitions of goods from the EU (Northern Ireland only)", baseMinor: 0, taxMinor: null },
  ],
}

export const uk: Jurisdiction = {
  code: "uk",
  countryCode: "GB",
  eInvoicing: false,
  name: "United Kingdom",
  currency: "GBP",
  locale: "en-GB",
  timezone: "Europe/London",
  taxLabel: "VAT",
  taxIdLabel: "VAT number",
  taxRatesBp: [2000, 500, 0],
  defaultTaxRateBp: 2000,
  invoiceLanguage: "en",
  bankFields: ["sortCode", "accountNumber", "iban", "bic"],
  milestoneThresholdMinor: 1_000_000,
  csvSynonyms: englishCsvSynonyms,
  chartOfAccounts: [
    { code: "4000", name: "Turnover (sales)", kind: "income", taxLine: "SA103F Box 15: Turnover" },
    { code: "4900", name: "Other business income", kind: "income", taxLine: "SA103F Box 16: Other business income" },
    { code: "5000", name: "Cost of goods bought for resale", kind: "expense", taxLine: "SA103F Box 17: Cost of goods", inputTaxBp: 2000 },
    { code: "5100", name: "Subcontractors", kind: "expense", taxLine: "SA103F Box 18: Construction subcontractors", inputTaxBp: 2000 },
    { code: "6000", name: "Wages, salaries & staff costs", kind: "expense", taxLine: "SA103F Box 19: Staff costs", inputTaxBp: 0, outOfScope: true },
    { code: "6100", name: "Car, van & travel", kind: "expense", taxLine: "SA103F Box 20: Car, van and travel", inputTaxBp: 2000 },
    { code: "6200", name: "Rent, rates, power & insurance", kind: "expense", taxLine: "SA103F Box 21: Premises costs", inputTaxBp: 0 },
    { code: "6300", name: "Repairs & maintenance", kind: "expense", taxLine: "SA103F Box 22: Repairs", inputTaxBp: 2000 },
    { code: "6400", name: "Phone, stationery & office (incl. software)", kind: "expense", taxLine: "SA103F Box 23: Office costs", inputTaxBp: 2000 },
    { code: "6500", name: "Advertising & marketing", kind: "expense", taxLine: "SA103F Box 24: Advertising", inputTaxBp: 2000 },
    { code: "6550", name: "Business entertainment (disallowable)", kind: "expense", taxLine: "SA103F Box 24: Entertainment (disallowable)", inputTaxBp: 0 },
    { code: "6600", name: "Interest on loans", kind: "expense", taxLine: "SA103F Box 25: Interest", inputTaxBp: 0 },
    { code: "6700", name: "Bank & card charges", kind: "expense", taxLine: "SA103F Box 26: Financial charges", inputTaxBp: 0 },
    { code: "6800", name: "Accountancy, legal & professional fees", kind: "expense", taxLine: "SA103F Box 28: Professional fees", inputTaxBp: 2000 },
    { code: "6900", name: "Other business expenses", kind: "expense", taxLine: "SA103F Box 30: Other expenses", inputTaxBp: 2000 },
    { code: "2200", name: "VAT paid to HMRC", kind: "tax", taxLine: null },
    { code: "1200", name: "Transfers between own accounts", kind: "transfer", taxLine: null },
    { code: "3000", name: "Owner drawings", kind: "owner", taxLine: null },
    { code: "3100", name: "Capital introduced", kind: "owner", taxLine: null },
  ],
  vatReturn,
  requiredInvoiceFields: (profile) => (profile.taxRegistered ? ["sellerAddress", "clientAddress", "sellerTaxId"] : ["sellerAddress", "clientAddress"]),
  exemptionNote: (profile) => (profile.taxRegistered ? null : "Not VAT registered."),
  taxDeadlines: (profile, from, to) => collectDeadlines(from, to, (year) => perYear(profile, year)),
}
