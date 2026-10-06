import type { ClientInfo, InvoiceSnapshot, SellerInfo } from "@/invoicing/rules"
import type { IsoDate } from "@/lib/dates"
import { roundHalfAwayFromZero } from "@/lib/money"
import { countryCode } from "./countries"

/**
 * EN 16931 invoices in UN/CEFACT Cross Industry Invoice (CII D22B) syntax — the XML inside ZUGFeRD/Factur-X PDFs,
 * and (with the KoSIT CIUS) a standalone XRechnung. Built from the frozen snapshot, so it always matches the PDF.
 */
export type EInvoiceProfile = "en16931" | "xrechnung"

export type EInvoiceInput = {
  kind: "invoice" | "credit_note"
  number: string
  issueDate: IsoDate
  serviceDate: IsoDate | null
  dueDate: IsoDate
  notes: string
  paymentTerms: string
  /** Invoice corrected by a credit note (BT-25). */
  relatedNumber: string | null
  snapshot: InvoiceSnapshot
  /** ISO country of the seller's jurisdiction, used when an address has no country. */
  homeCountry: string
  /** Leitweg-ID / PO reference (BT-10), resolved by the caller. */
  buyerReference: string
}

const GUIDELINE: Record<EInvoiceProfile, string> = {
  en16931: "urn:cen.eu:en16931:2017",
  xrechnung: "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0",
}
const PEPPOL_BILLING = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0"

/** UN/ECE Recommendation 20 codes for the units people type. */
const UNIT_CODES: Record<string, string> = {
  h: "HUR",
  hr: "HUR",
  hrs: "HUR",
  hour: "HUR",
  hours: "HUR",
  std: "HUR",
  stunde: "HUR",
  stunden: "HUR",
  d: "DAY",
  day: "DAY",
  days: "DAY",
  tag: "DAY",
  tage: "DAY",
  pt: "DAY",
  month: "MON",
  months: "MON",
  monat: "MON",
  monate: "MON",
  mo: "MON",
  week: "WEE",
  weeks: "WEE",
  woche: "WEE",
  wochen: "WEE",
  pcs: "H87",
  pc: "H87",
  piece: "H87",
  pieces: "H87",
  stk: "H87",
  stück: "H87",
  km: "KMT",
  kg: "KGM",
  m: "MTR",
  l: "LTR",
}

const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const date102 = (iso: IsoDate) => `<udt:DateTimeString format="102">${iso.replace(/-/g, "")}</udt:DateTimeString>`

/** Minor units → "1234.50", without floating point. */
export function decimalAmount(minor: number): string {
  const sign = minor < 0 ? "-" : ""
  const abs = Math.abs(minor)
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`
}

/** Milli-units → "2.5", trailing zeros trimmed. */
function decimalQuantity(milli: number): string {
  const sign = milli < 0 ? "-" : ""
  const abs = Math.abs(milli)
  const fraction = String(abs % 1000)
    .padStart(3, "0")
    .replace(/0+$/, "")
  return `${sign}${Math.trunc(abs / 1000)}${fraction ? `.${fraction}` : ""}`
}

const percent = (bp: number) => String(bp / 100)
const tag = (name: string, value: string | null | undefined) => (value ? `<ram:${name}>${esc(value)}</ram:${name}>` : "")

type Category = { code: "S" | "Z" | "E"; reason: string | null }
/** Standard-rated, zero-rated, or exempt with the reason printed on the invoice (e.g. §19 UStG). */
function category(rateBp: number, exemptionNote: string | null): Category {
  if (rateBp > 0) return { code: "S", reason: null }
  return exemptionNote ? { code: "E", reason: exemptionNote } : { code: "Z", reason: null }
}

function address(party: SellerInfo | ClientInfo, homeCountry: string): string {
  return `<ram:PostalTradeAddress>${tag("PostcodeCode", party.postcode)}${tag("LineOne", party.addressLine1)}${tag("LineTwo", party.addressLine2)}${tag("CityName", party.city)}<ram:CountryID>${countryCode(party.country, homeCountry)}</ram:CountryID></ram:PostalTradeAddress>`
}

const email = (value: string | undefined) =>
  value ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(value)}</ram:URIID></ram:URIUniversalCommunication>` : ""

/** What stops this document from being a valid e-invoice in the chosen profile (empty = ready). */
export function eInvoiceProblems(input: EInvoiceInput, profile: EInvoiceProfile): string[] {
  const { seller, client } = input.snapshot
  const problems: string[] = []
  if (!seller.vatId && !seller.taxNumber) problems.push("Add your VAT ID or tax number in Settings.")
  if (!seller.addressLine1 || !seller.postcode || !seller.city) problems.push("Complete your business address (street, postcode, city) in Settings.")
  if (!client.addressLine1 || !client.postcode || !client.city) problems.push(`Complete the address of ${client.name} (street, postcode, city).`)
  if (profile === "xrechnung") {
    if (!input.buyerReference) problems.push(`Add the Leitweg-ID / buyer reference to ${client.name} — XRechnung requires it.`)
    if (!seller.email || !seller.phone) problems.push("Add your billing email and phone number in Settings — XRechnung requires a seller contact.")
    if (!client.email) problems.push(`Add an email address for ${client.name} — XRechnung requires the buyer's electronic address.`)
  }
  return problems
}

export function buildCiiXml(input: EInvoiceInput, profile: EInvoiceProfile): string {
  const { snapshot: snap } = input
  const { seller, client } = snap
  // A credit note (TypeCode 381) states positive amounts; ours are stored as negated invoice lines.
  const sign = input.kind === "credit_note" ? -1 : 1
  const currency = snap.currency
  const money = (minor: number) => decimalAmount(sign * minor)

  const lines = snap.items.map((item, index) => {
    const gross = roundHalfAwayFromZero((item.quantityMilli * item.unitPriceMinor) / 1000)
    const discount = gross - item.netMinor
    const cat = category(item.taxRateBp, snap.exemptionNote)
    const unit = UNIT_CODES[(item.unit ?? "").trim().toLowerCase()] ?? "C62"
    return [
      "<ram:IncludedSupplyChainTradeLineItem>",
      `<ram:AssociatedDocumentLineDocument><ram:LineID>${index + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>`,
      `<ram:SpecifiedTradeProduct>${tag("Name", item.description.trim() || "—")}</ram:SpecifiedTradeProduct>`,
      `<ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${decimalAmount(item.unitPriceMinor)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>`,
      `<ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${unit}">${decimalQuantity(sign * item.quantityMilli)}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>`,
      "<ram:SpecifiedLineTradeSettlement>",
      `<ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${cat.code}</ram:CategoryCode><ram:RateApplicablePercent>${percent(item.taxRateBp)}</ram:RateApplicablePercent></ram:ApplicableTradeTax>`,
      discount
        ? `<ram:SpecifiedTradeAllowanceCharge><ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator><ram:CalculationPercent>${percent(item.discountBp ?? 0)}</ram:CalculationPercent><ram:BasisAmount>${money(gross)}</ram:BasisAmount><ram:ActualAmount>${money(discount)}</ram:ActualAmount><ram:Reason>Rabatt</ram:Reason></ram:SpecifiedTradeAllowanceCharge>`
        : "",
      `<ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${money(item.netMinor)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>`,
      "</ram:SpecifiedLineTradeSettlement>",
      "</ram:IncludedSupplyChainTradeLineItem>",
    ].join("")
  })

  const taxes = snap.taxGroups.map((g) => {
    const cat = category(g.rateBp, snap.exemptionNote)
    return `<ram:ApplicableTradeTax><ram:CalculatedAmount>${money(g.taxMinor)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode>${tag("ExemptionReason", cat.reason)}<ram:BasisAmount>${money(g.netMinor)}</ram:BasisAmount><ram:CategoryCode>${cat.code}</ram:CategoryCode><ram:RateApplicablePercent>${percent(g.rateBp)}</ram:RateApplicablePercent></ram:ApplicableTradeTax>`
  })

  const lineTotal = snap.items.reduce((s, i) => s + i.netMinor, 0)
  const taxTotal = snap.taxGroups.reduce((s, g) => s + g.taxMinor, 0)
  const iban = (seller.bankIban ?? "").replace(/\s+/g, "").toUpperCase()
  const bic = (seller.bankBic ?? "").replace(/\s+/g, "").toUpperCase()
  const paymentMeans = iban
    ? `<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${esc(iban)}</ram:IBANID>${tag("AccountName", seller.legalName || seller.name)}</ram:PayeePartyCreditorFinancialAccount>${bic ? `<ram:PayeeSpecifiedCreditorFinancialInstitution><ram:BICID>${esc(bic)}</ram:BICID></ram:PayeeSpecifiedCreditorFinancialInstitution>` : ""}</ram:SpecifiedTradeSettlementPaymentMeans>`
    : `<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>1</ram:TypeCode></ram:SpecifiedTradeSettlementPaymentMeans>`
  const notes = [input.notes.trim(), snap.exemptionNote ?? ""].filter(Boolean)
  const contact =
    seller.phone || seller.email
      ? `<ram:DefinedTradeContact>${tag("PersonName", seller.legalName || seller.name)}${seller.phone ? `<ram:TelephoneUniversalCommunication><ram:CompleteNumber>${esc(seller.phone)}</ram:CompleteNumber></ram:TelephoneUniversalCommunication>` : ""}${seller.email ? `<ram:EmailURIUniversalCommunication><ram:URIID>${esc(seller.email)}</ram:URIID></ram:EmailURIUniversalCommunication>` : ""}</ram:DefinedTradeContact>`
      : ""
  const sellerTax = [
    seller.vatId && `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(seller.vatId.replace(/\s+/g, ""))}</ram:ID></ram:SpecifiedTaxRegistration>`,
    seller.taxNumber && `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${esc(seller.taxNumber)}</ram:ID></ram:SpecifiedTaxRegistration>`,
  ]
    .filter(Boolean)
    .join("")

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">`,
    "<rsm:ExchangedDocumentContext>",
    profile === "xrechnung"
      ? `<ram:BusinessProcessSpecifiedDocumentContextParameter><ram:ID>${PEPPOL_BILLING}</ram:ID></ram:BusinessProcessSpecifiedDocumentContextParameter>`
      : "",
    `<ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>${GUIDELINE[profile]}</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>`,
    "</rsm:ExchangedDocumentContext>",
    "<rsm:ExchangedDocument>",
    `<ram:ID>${esc(input.number)}</ram:ID>`,
    `<ram:TypeCode>${input.kind === "credit_note" ? 381 : 380}</ram:TypeCode>`,
    `<ram:IssueDateTime>${date102(input.issueDate)}</ram:IssueDateTime>`,
    ...notes.map((n) => `<ram:IncludedNote><ram:Content>${esc(n)}</ram:Content></ram:IncludedNote>`),
    "</rsm:ExchangedDocument>",
    "<rsm:SupplyChainTradeTransaction>",
    ...lines,
    "<ram:ApplicableHeaderTradeAgreement>",
    tag("BuyerReference", input.buyerReference),
    `<ram:SellerTradeParty>${tag("Name", seller.legalName || seller.name)}${contact}${address(seller, input.homeCountry)}${email(seller.email)}${sellerTax}</ram:SellerTradeParty>`,
    `<ram:BuyerTradeParty>${tag("Name", client.name)}${address(client, input.homeCountry)}${email(client.email)}${client.vatId ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(client.vatId.replace(/\s+/g, ""))}</ram:ID></ram:SpecifiedTaxRegistration>` : ""}</ram:BuyerTradeParty>`,
    "</ram:ApplicableHeaderTradeAgreement>",
    `<ram:ApplicableHeaderTradeDelivery><ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime>${date102(input.serviceDate ?? input.issueDate)}</ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent></ram:ApplicableHeaderTradeDelivery>`,
    "<ram:ApplicableHeaderTradeSettlement>",
    `<ram:PaymentReference>${esc(input.number)}</ram:PaymentReference>`,
    `<ram:InvoiceCurrencyCode>${currency}</ram:InvoiceCurrencyCode>`,
    paymentMeans,
    ...taxes,
    `<ram:SpecifiedTradePaymentTerms>${tag("Description", input.paymentTerms || null)}<ram:DueDateDateTime>${date102(input.dueDate)}</ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>`,
    "<ram:SpecifiedTradeSettlementHeaderMonetarySummation>",
    `<ram:LineTotalAmount>${money(lineTotal)}</ram:LineTotalAmount>`,
    `<ram:TaxBasisTotalAmount>${money(lineTotal)}</ram:TaxBasisTotalAmount>`,
    `<ram:TaxTotalAmount currencyID="${currency}">${money(taxTotal)}</ram:TaxTotalAmount>`,
    `<ram:GrandTotalAmount>${money(lineTotal + taxTotal)}</ram:GrandTotalAmount>`,
    `<ram:DuePayableAmount>${money(lineTotal + taxTotal)}</ram:DuePayableAmount>`,
    "</ram:SpecifiedTradeSettlementHeaderMonetarySummation>",
    input.relatedNumber
      ? `<ram:InvoiceReferencedDocument><ram:IssuerAssignedID>${esc(input.relatedNumber)}</ram:IssuerAssignedID></ram:InvoiceReferencedDocument>`
      : "",
    "</ram:ApplicableHeaderTradeSettlement>",
    "</rsm:SupplyChainTradeTransaction>",
    "</rsm:CrossIndustryInvoice>",
  ].join("\n")
}
