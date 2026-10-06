import { salesAtRate, wholeUnits } from "@/tax/vat-return"
import { dayOfMonth, lastDayOfMonth, nextBusinessDay } from "@/lib/dates"
import { collectDeadlines, pad2 } from "./deadlines"
import { germanHolidays } from "./holidays"
import type { Jurisdiction, TaxDeadline, TaxProfile, VatReturnForm } from "./types"

const shift = (iso: string) => nextBusinessDay(iso, germanHolidays)

function ustVoranmeldungen(profile: TaxProfile, year: number): TaxDeadline[] {
  if (!profile.taxRegistered || profile.smallBusinessExempt || profile.vatFilingFrequency === "none") return []
  const months = profile.vatFilingFrequency === "monthly" ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [3, 6, 9, 12]
  const extra = profile.deDauerfrist ? 1 : 0
  return months.map((month) => {
    const period = profile.vatFilingFrequency === "monthly" ? `${year}-${pad2(month)}` : `${year}-Q${month / 3}`
    return {
      id: `de-ustva-${period}`,
      date: shift(dayOfMonth(year, month, 10, 1 + extra)),
      title: `USt-Voranmeldung ${period}`,
      detail: `VAT pre-return and payment for ${period} (§18 UStG${extra ? ", incl. Dauerfristverlängerung" : ""}).`,
    }
  })
}

function perYear(profile: TaxProfile, year: number): TaxDeadline[] {
  const prepayments = [3, 6, 9, 12].map((month) => ({
    id: `de-est-vz-${year}-${pad2(month)}`,
    date: shift(dayOfMonth(year, month, 10)),
    title: "ESt-Vorauszahlung",
    detail: "Quarterly income-tax prepayment (§37 EStG).",
  }))
  const annual = {
    id: `de-annual-${year - 1}`,
    date: shift(lastDayOfMonth(year, 7)),
    title: `Steuererklärungen ${year - 1}`,
    detail: `Annual income-tax and VAT returns for ${year - 1} (without a tax adviser, §149 AO).`,
  }
  return [...ustVoranmeldungen(profile, year), ...prepayments, annual]
}

/** Umsatzsteuer-Voranmeldung: bases in whole euros (Kz 81/86), input tax in Kz 66, the balance in Kz 83. */
const vatReturn: VatReturnForm = {
  name: "Umsatzsteuer-Voranmeldung",
  tabLabel: "USt-Voranmeldung",
  boxHeader: "Kz.",
  baseHeader: "Bemessungsgrundlage",
  filingHint: " via ELSTER",
  calendarQuarters: true,
  requiresRegistration: true,
  showsInputTax: true,
  deadlineIdPrefix: "de-ustva",
  lines: (s) => {
    const standard = salesAtRate(s, 1900)
    const reduced = salesAtRate(s, 700)
    const zero = salesAtRate(s, 0)
    const other = s.sales.filter((g) => ![1900, 700, 0].includes(g.rateBp))
    return [
      { key: "81", box: "81", label: "Steuerpflichtige Umsätze zu 19 %", baseMinor: wholeUnits(standard.netMinor), taxMinor: standard.taxMinor },
      { key: "86", box: "86", label: "Steuerpflichtige Umsätze zu 7 %", baseMinor: wholeUnits(reduced.netMinor), taxMinor: reduced.taxMinor },
      ...(other.length
        ? [
            {
              key: "35",
              box: "35/36",
              label: "Umsätze zu anderen Steuersätzen",
              baseMinor: wholeUnits(other.reduce((t, g) => t + g.netMinor, 0)),
              taxMinor: other.reduce((t, g) => t + g.taxMinor, 0),
            },
          ]
        : []),
      ...(zero.netMinor
        ? [{ key: "45", box: "45", label: "Nicht steuerbare / steuerfreie Umsätze (prüfen)", baseMinor: wholeUnits(zero.netMinor), taxMinor: null }]
        : []),
      { key: "66", box: "66", label: "Vorsteuerbeträge aus Rechnungen von anderen Unternehmern", baseMinor: null, taxMinor: s.inputTaxMinor },
      {
        key: "83",
        box: "83",
        label: s.netTaxMinor >= 0 ? "Verbleibende Umsatzsteuer-Vorauszahlung" : "Verbleibender Überschuss (Erstattung)",
        baseMinor: null,
        taxMinor: s.netTaxMinor,
        total: true,
      },
    ]
  },
}

export const de: Jurisdiction = {
  code: "de",
  countryCode: "DE",
  eInvoicing: true,
  name: "Germany",
  currency: "EUR",
  locale: "de-DE",
  timezone: "Europe/Berlin",
  taxLabel: "USt",
  taxIdLabel: "Steuernummer / USt-IdNr.",
  taxRatesBp: [1900, 700, 0],
  defaultTaxRateBp: 1900,
  invoiceLanguage: "de",
  bankFields: ["iban", "bic"],
  milestoneThresholdMinor: 1_000_000,
  csvSynonyms: {
    date: ["buchungstag", "buchungsdatum", "datum", "valuta", "wertstellung", "valutadatum"],
    description: ["verwendungszweck", "buchungstext", "beschreibung", "vorgang"],
    counterparty: [
      "beguenstigter/zahlungspflichtiger",
      "begünstigter/zahlungspflichtiger",
      "empfänger",
      "empfaenger",
      "auftraggeber",
      "zahlungsempfänger",
      "name",
    ],
    amount: ["betrag", "umsatz", "betrag (eur)", "betrag (€)"],
    debit: ["soll", "ausgang", "belastung"],
    credit: ["haben", "eingang", "gutschrift"],
    balance: ["saldo", "kontostand"],
    currency: ["währung", "waehrung"],
  },
  exemptIncomeCode: "8195",
  chartOfAccounts: [
    { code: "8400", name: "Erlöse 19 % USt", kind: "income", taxLine: "EÜR: Betriebseinnahmen (USt-pflichtig)" },
    { code: "8300", name: "Erlöse 7 % USt", kind: "income", taxLine: "EÜR: Betriebseinnahmen (USt-pflichtig)" },
    { code: "8195", name: "Erlöse Kleinunternehmer §19", kind: "income", taxLine: "EÜR: Betriebseinnahmen Kleinunternehmer" },
    { code: "8125", name: "Steuerfreie Erlöse (EU/Reverse Charge)", kind: "income", taxLine: "EÜR: Steuerfreie Betriebseinnahmen" },
    { code: "2700", name: "Sonstige Erträge", kind: "income", taxLine: "EÜR: Sonstige Betriebseinnahmen" },
    { code: "3400", name: "Wareneingang", kind: "expense", taxLine: "EÜR: Waren, Roh- und Hilfsstoffe", inputTaxBp: 1900 },
    { code: "3100", name: "Fremdleistungen", kind: "expense", taxLine: "EÜR: Bezogene Fremdleistungen", inputTaxBp: 1900 },
    { code: "4120", name: "Gehälter und Löhne", kind: "expense", taxLine: "EÜR: Personalkosten", inputTaxBp: 0, outOfScope: true },
    { code: "4210", name: "Miete / Raumkosten", kind: "expense", taxLine: "EÜR: Raumkosten", inputTaxBp: 0 },
    { code: "4240", name: "Strom, Gas, Wasser", kind: "expense", taxLine: "EÜR: Raumkosten", inputTaxBp: 1900 },
    { code: "4360", name: "Versicherungen", kind: "expense", taxLine: "EÜR: Übrige Betriebsausgaben", inputTaxBp: 0 },
    { code: "4380", name: "Beiträge", kind: "expense", taxLine: "EÜR: Übrige Betriebsausgaben", inputTaxBp: 0 },
    { code: "4530", name: "Kfz-Kosten", kind: "expense", taxLine: "EÜR: Kfz-Kosten", inputTaxBp: 1900 },
    { code: "4600", name: "Werbekosten", kind: "expense", taxLine: "EÜR: Werbekosten", inputTaxBp: 1900 },
    { code: "4650", name: "Bewirtungskosten", kind: "expense", taxLine: "EÜR: Bewirtungsaufwendungen", inputTaxBp: 1900 },
    { code: "4660", name: "Reisekosten", kind: "expense", taxLine: "EÜR: Reisekosten", inputTaxBp: 1900 },
    { code: "4806", name: "Software & Wartung", kind: "expense", taxLine: "EÜR: Übrige Betriebsausgaben", inputTaxBp: 1900 },
    { code: "4910", name: "Porto", kind: "expense", taxLine: "EÜR: Übrige Betriebsausgaben", inputTaxBp: 1900 },
    { code: "4920", name: "Telefon & Internet", kind: "expense", taxLine: "EÜR: Telekommunikation", inputTaxBp: 1900 },
    { code: "4930", name: "Bürobedarf", kind: "expense", taxLine: "EÜR: Übrige Betriebsausgaben", inputTaxBp: 1900 },
    { code: "4940", name: "Fachliteratur & Fortbildung", kind: "expense", taxLine: "EÜR: Fortbildungskosten", inputTaxBp: 700 },
    { code: "4950", name: "Rechts- und Beratungskosten", kind: "expense", taxLine: "EÜR: Rechts- und Steuerberatung", inputTaxBp: 1900 },
    { code: "4970", name: "Nebenkosten des Geldverkehrs", kind: "expense", taxLine: "EÜR: Übrige Betriebsausgaben", inputTaxBp: 0 },
    { code: "4900", name: "Sonstige Betriebsausgaben", kind: "expense", taxLine: "EÜR: Übrige Betriebsausgaben", inputTaxBp: 1900 },
    { code: "1780", name: "Umsatzsteuer-Zahlungen an das Finanzamt", kind: "tax", taxLine: "EÜR: An das Finanzamt gezahlte USt" },
    { code: "1360", name: "Geldtransit / Umbuchungen", kind: "transfer", taxLine: null },
    { code: "1800", name: "Privatentnahmen", kind: "owner", taxLine: null },
    { code: "1890", name: "Privateinlagen", kind: "owner", taxLine: null },
  ],
  vatReturn,
  settingsLabels: {
    taxNumber: "Steuernummer",
    vatId: "USt-IdNr.",
    vatAccounting: "Versteuerung",
    accrual: "Soll (on invoice date)",
    cash: "Ist (on payment)",
    smallBusinessExemption: "Kleinunternehmer (§19 UStG)",
    filingExtension: "Dauerfristverlängerung",
  },
  requiredInvoiceFields: () => ["sellerAddress", "clientAddress", "sellerTaxId", "serviceDate"],
  exemptionNote: (profile) => (profile.smallBusinessExempt ? "Gemäß §19 UStG wird keine Umsatzsteuer berechnet." : null),
  taxDeadlines: (profile, from, to) => collectDeadlines(from, to, (year) => perYear(profile, year)),
}
