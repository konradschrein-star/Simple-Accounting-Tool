import { isoOf, lastDayOfMonth } from "@/lib/dates"
import { collectDeadlines, pad2, quarterEndMonths } from "./deadlines"
import { englishCsvSynonyms } from "./uk"
import type { Jurisdiction, TaxDeadline, TaxProfile } from "./types"

function perYear(profile: TaxProfile, year: number): TaxDeadline[] {
  const deadlines: TaxDeadline[] = [
    {
      id: `je-return-${year - 1}`,
      date: isoOf(year, 7, 31),
      title: `Personal tax return ${year - 1}`,
      detail: `Online personal income tax return for ${year - 1} (31 May on paper).`,
    },
    {
      id: `je-poa1-${year}`,
      date: isoOf(year, 11, 30),
      title: "Payment on account / balance",
      detail: `First ${year} payment on account and balance of ${year - 1} tax (non-ITIS).`,
    },
    {
      id: `je-poa2-${year}`,
      date: isoOf(year, 5, 31),
      title: "2nd payment on account",
      detail: `Second payment on account for ${year - 1} (non-ITIS).`,
    },
  ]
  if (profile.taxRegistered && profile.vatFilingFrequency !== "none") {
    for (const month of quarterEndMonths(profile.vatPeriodEndMonth)) {
      deadlines.push({
        id: `je-gst-${year}-${pad2(month)}`,
        date: lastDayOfMonth(year, month, 1),
        title: "GST return & payment",
        detail: `GST quarter ending ${year}-${pad2(month)}.`,
      })
    }
  }
  return deadlines
}

export const je: Jurisdiction = {
  code: "je",
  name: "Jersey",
  currency: "GBP",
  locale: "en-GB",
  timezone: "Europe/Jersey",
  taxLabel: "GST",
  taxIdLabel: "GST registration number",
  taxRatesBp: [500, 0],
  defaultTaxRateBp: 500,
  invoiceLanguage: "en",
  bankFields: ["sortCode", "accountNumber", "iban", "bic"],
  milestoneThresholdMinor: 1_000_000,
  csvSynonyms: englishCsvSynonyms,
  chartOfAccounts: [
    { code: "4000", name: "Sales", kind: "income", taxLine: "Business income" },
    { code: "4900", name: "Other income", kind: "income", taxLine: "Other income" },
    { code: "5000", name: "Cost of sales", kind: "expense", taxLine: "Cost of sales" },
    { code: "6000", name: "Staff costs", kind: "expense", taxLine: "Allowable expenses" },
    { code: "6100", name: "Motor & travel", kind: "expense", taxLine: "Allowable expenses" },
    { code: "6200", name: "Premises & utilities", kind: "expense", taxLine: "Allowable expenses" },
    { code: "6400", name: "Office, phone & software", kind: "expense", taxLine: "Allowable expenses" },
    { code: "6500", name: "Marketing", kind: "expense", taxLine: "Allowable expenses" },
    { code: "6700", name: "Bank charges", kind: "expense", taxLine: "Allowable expenses" },
    { code: "6750", name: "Insurance", kind: "expense", taxLine: "Allowable expenses" },
    { code: "6800", name: "Professional fees", kind: "expense", taxLine: "Allowable expenses" },
    { code: "6900", name: "Other expenses", kind: "expense", taxLine: "Allowable expenses" },
    { code: "2200", name: "GST paid to Revenue Jersey", kind: "tax", taxLine: null },
    { code: "1200", name: "Transfers between own accounts", kind: "transfer", taxLine: null },
    { code: "3000", name: "Drawings", kind: "owner", taxLine: null },
    { code: "3100", name: "Capital introduced", kind: "owner", taxLine: null },
  ],
  inputTax: { standardBp: 500, byAccount: { "6000": 0, "6700": 0, "6750": 0 } },
  requiredInvoiceFields: (profile) =>
    profile.taxRegistered ? ["sellerAddress", "clientAddress", "sellerTaxId", "serviceDate"] : ["sellerAddress", "clientAddress"],
  exemptionNote: (profile) => (profile.taxRegistered ? null : "Not registered for GST — no GST charged."),
  taxDeadlines: (profile, from, to) => collectDeadlines(from, to, (year) => perYear(profile, year)),
}
