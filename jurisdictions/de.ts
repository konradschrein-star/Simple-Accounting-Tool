import { dayOfMonth, lastDayOfMonth, nextBusinessDay } from "@/lib/dates"
import { collectDeadlines, pad2 } from "./deadlines"
import { germanHolidays } from "./holidays"
import type { Jurisdiction, TaxDeadline, TaxProfile } from "./types"

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

export const de: Jurisdiction = {
  code: "de",
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
    counterparty: ["beguenstigter/zahlungspflichtiger", "begünstigter/zahlungspflichtiger", "empfänger", "empfaenger", "auftraggeber", "zahlungsempfänger", "name"],
    amount: ["betrag", "umsatz", "betrag (eur)", "betrag (€)"],
    debit: ["soll", "ausgang", "belastung"],
    credit: ["haben", "eingang", "gutschrift"],
    balance: ["saldo", "kontostand"],
    currency: ["währung", "waehrung"],
  },
  chartOfAccounts: [
    { code: "8400", name: "Erlöse 19 % USt", kind: "income", taxLine: "EÜR: Betriebseinnahmen (USt-pflichtig)" },
    { code: "8300", name: "Erlöse 7 % USt", kind: "income", taxLine: "EÜR: Betriebseinnahmen (USt-pflichtig)" },
    { code: "8195", name: "Erlöse Kleinunternehmer §19", kind: "income", taxLine: "EÜR: Betriebseinnahmen Kleinunternehmer" },
    { code: "8125", name: "Steuerfreie Erlöse (EU/Reverse Charge)", kind: "income", taxLine: "EÜR: Steuerfreie Betriebseinnahmen" },
    { code: "2700", name: "Sonstige Erträge", kind: "income", taxLine: "EÜR: Sonstige Betriebseinnahmen" },
    { code: "3400", name: "Wareneingang", kind: "expense", taxLine: "EÜR: Waren, Roh- und Hilfsstoffe" },
    { code: "3100", name: "Fremdleistungen", kind: "expense", taxLine: "EÜR: Bezogene Fremdleistungen" },
    { code: "4120", name: "Gehälter und Löhne", kind: "expense", taxLine: "EÜR: Personalkosten" },
    { code: "4210", name: "Miete / Raumkosten", kind: "expense", taxLine: "EÜR: Raumkosten" },
    { code: "4240", name: "Strom, Gas, Wasser", kind: "expense", taxLine: "EÜR: Raumkosten" },
    { code: "4360", name: "Versicherungen", kind: "expense", taxLine: "EÜR: Übrige Betriebsausgaben" },
    { code: "4380", name: "Beiträge", kind: "expense", taxLine: "EÜR: Übrige Betriebsausgaben" },
    { code: "4530", name: "Kfz-Kosten", kind: "expense", taxLine: "EÜR: Kfz-Kosten" },
    { code: "4600", name: "Werbekosten", kind: "expense", taxLine: "EÜR: Werbekosten" },
    { code: "4650", name: "Bewirtungskosten", kind: "expense", taxLine: "EÜR: Bewirtungsaufwendungen" },
    { code: "4660", name: "Reisekosten", kind: "expense", taxLine: "EÜR: Reisekosten" },
    { code: "4806", name: "Software & Wartung", kind: "expense", taxLine: "EÜR: Übrige Betriebsausgaben" },
    { code: "4910", name: "Porto", kind: "expense", taxLine: "EÜR: Übrige Betriebsausgaben" },
    { code: "4920", name: "Telefon & Internet", kind: "expense", taxLine: "EÜR: Telekommunikation" },
    { code: "4930", name: "Bürobedarf", kind: "expense", taxLine: "EÜR: Übrige Betriebsausgaben" },
    { code: "4940", name: "Fachliteratur & Fortbildung", kind: "expense", taxLine: "EÜR: Fortbildungskosten" },
    { code: "4950", name: "Rechts- und Beratungskosten", kind: "expense", taxLine: "EÜR: Rechts- und Steuerberatung" },
    { code: "4970", name: "Nebenkosten des Geldverkehrs", kind: "expense", taxLine: "EÜR: Übrige Betriebsausgaben" },
    { code: "4900", name: "Sonstige Betriebsausgaben", kind: "expense", taxLine: "EÜR: Übrige Betriebsausgaben" },
    { code: "1780", name: "Umsatzsteuer-Zahlungen an das Finanzamt", kind: "tax", taxLine: "EÜR: An das Finanzamt gezahlte USt" },
    { code: "1360", name: "Geldtransit / Umbuchungen", kind: "transfer", taxLine: null },
    { code: "1800", name: "Privatentnahmen", kind: "owner", taxLine: null },
    { code: "1890", name: "Privateinlagen", kind: "owner", taxLine: null },
  ],
  requiredInvoiceFields: () => ["sellerAddress", "clientAddress", "sellerTaxId", "serviceDate"],
  exemptionNote: (profile) =>
    profile.smallBusinessExempt ? "Gemäß §19 UStG wird keine Umsatzsteuer berechnet." : null,
  taxDeadlines: (profile, from, to) => collectDeadlines(from, to, (year) => perYear(profile, year)),
}
