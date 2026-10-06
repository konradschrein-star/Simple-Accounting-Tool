import "@/einvoice/libxml-windows"
import { check } from "@stafyniaksacha/facturx"
import { describe, expect, it } from "vitest"
import type { InvoiceSnapshot } from "@/invoicing/rules"
import { buildCiiXml, decimalAmount, eInvoiceProblems, type EInvoiceInput } from "@/einvoice/cii"
import { countryCode } from "@/einvoice/countries"
import { computeTotals, lineNetMinor } from "@/lib/money"

const lines = [
  { description: "Brand-Workshop (Tagessatz)", quantityMilli: 2000, unitPriceMinor: 120000, taxRateBp: 1900, discountBp: 1000, unit: "Tag" },
  { description: "Webdesign & <Umsetzung>", quantityMilli: 12500, unitPriceMinor: 9500, taxRateBp: 1900, unit: "h" },
  { description: "Fachbuch", quantityMilli: 1000, unitPriceMinor: 4990, taxRateBp: 700 },
]

function snapshot(overrides: Partial<InvoiceSnapshot> = {}, items = lines): InvoiceSnapshot {
  return {
    kind: "invoice",
    relatedNumber: null,
    seller: {
      name: "Studio Nord",
      legalName: "Studio Nord – Lea Hartmann",
      addressLine1: "Torstraße 112",
      addressLine2: "",
      postcode: "10119",
      city: "Berlin",
      country: "Deutschland",
      email: "hallo@studio-nord.example",
      phone: "+49 30 1234567",
      website: "",
      taxNumber: "37/123/45678",
      vatId: "DE312345671",
      bankIban: "DE89370400440532013000",
      bankBic: "COBADEFFXXX",
      ukSortCode: "",
      ukAccountNumber: "",
      usRoutingNumber: "",
    },
    client: {
      name: "Bäckerei Müller GmbH",
      email: "buchhaltung@mueller.example",
      addressLine1: "Hauptstraße 5",
      addressLine2: "",
      postcode: "80331",
      city: "München",
      country: "",
      vatId: "",
      buyerReference: "04011000-12345-34",
    },
    jurisdiction: "de",
    language: "de",
    currency: "EUR",
    locale: "de-DE",
    taxLabel: "USt",
    exemptionNote: null,
    logoPath: null,
    items: items.map((l) => ({ ...l, netMinor: lineNetMinor(l.quantityMilli, l.unitPriceMinor, l.discountBp) })),
    taxGroups: computeTotals(items).taxGroups,
    ...overrides,
  }
}

const input = (snap: InvoiceSnapshot, extra: Partial<EInvoiceInput> = {}): EInvoiceInput => ({
  kind: "invoice",
  number: "INV-2026-0042",
  issueDate: "2026-10-06",
  serviceDate: "2026-09-30",
  dueDate: "2026-10-20",
  notes: "Vielen Dank für Ihren Auftrag.",
  paymentTerms: "",
  relatedNumber: null,
  snapshot: snap,
  homeCountry: "DE",
  buyerReference: snap.client.buyerReference,
  ...extra,
})

async function validate(xml: string) {
  const result = await check({ xml, flavor: "facturx", level: "en16931", schematron: true })
  return [...result.errors.map((e) => String(e.message ?? e)), ...(result.schematronErrors ?? []).filter((e) => e.flag !== "warning").map((e) => e.message)]
}

describe("e-invoice (EN 16931 CII)", () => {
  it("formats amounts and countries without floating point surprises", () => {
    expect(decimalAmount(123456)).toBe("1234.56")
    expect(decimalAmount(-5)).toBe("-0.05")
    expect(countryCode("Deutschland", "GB")).toBe("DE")
    expect(countryCode("United Kingdom", "DE")).toBe("GB")
    expect(countryCode("", "JE")).toBe("JE")
    expect(countryCode("at", "DE")).toBe("AT")
  })

  it("produces an invoice that passes the official XSD and EN 16931 business rules", async () => {
    const xml = buildCiiXml(input(snapshot()), "en16931")
    expect(xml).toContain("Webdesign &amp; &lt;Umsetzung&gt;")
    expect(xml).toContain('<ram:BilledQuantity unitCode="HUR">12.5</ram:BilledQuantity>')
    expect(xml).toContain("<ram:IBANID>DE89370400440532013000</ram:IBANID>")
    expect(await validate(xml)).toEqual([])
  }, 60_000)

  it("the validator really rejects broken invoices (wrong total, wrong element order)", async () => {
    const xml = buildCiiXml(input(snapshot()), "en16931")
    const wrongTotal = xml.replace(/<ram:GrandTotalAmount>[^<]+/, "<ram:GrandTotalAmount>1.00")
    expect((await validate(wrongTotal)).join(" ")).toMatch(/BR-CO-15/)
    const swapped = xml.replace(/(<ram:TypeCode>380<\/ram:TypeCode>)\n(<ram:IssueDateTime>.*?<\/ram:IssueDateTime>)/, "$2\n$1")
    expect(swapped).not.toBe(xml)
    expect(await validate(swapped)).not.toEqual([])
  }, 60_000)

  it("issues credit notes as TypeCode 381 with positive amounts and the corrected invoice", async () => {
    const reversed = lines.map((l) => ({ ...l, quantityMilli: -l.quantityMilli }))
    const xml = buildCiiXml(
      input(snapshot({ kind: "credit_note" }, reversed), { kind: "credit_note", number: "CN-2026-0001", relatedNumber: "INV-2026-0042" }),
      "en16931"
    )
    expect(xml).toContain("<ram:TypeCode>381</ram:TypeCode>")
    expect(xml).toContain("<ram:IssuerAssignedID>INV-2026-0042</ram:IssuerAssignedID>")
    expect(xml).not.toMatch(/<ram:GrandTotalAmount>-/)
    expect(await validate(xml)).toEqual([])
  }, 60_000)

  it("marks §19 UStG invoices as VAT-exempt with the reason", async () => {
    const exempt = lines.map((l) => ({ ...l, taxRateBp: 0 }))
    const xml = buildCiiXml(
      input(snapshot({ exemptionNote: "Gemäß §19 UStG wird keine Umsatzsteuer berechnet.", taxGroups: computeTotals(exempt).taxGroups }, exempt)),
      "en16931"
    )
    expect(xml).toContain("<ram:CategoryCode>E</ram:CategoryCode>")
    expect(await validate(xml)).toEqual([])
  }, 60_000)

  it("adds the XRechnung CIUS identifiers and requires its extra fields", () => {
    const xml = buildCiiXml(input(snapshot()), "xrechnung")
    expect(xml).toContain("urn:xeinkauf.de:kosit:xrechnung_3.0")
    expect(xml).toContain("<ram:BuyerReference>04011000-12345-34</ram:BuyerReference>")
    const bare = snapshot({ client: { ...snapshot().client, buyerReference: "", email: "" }, seller: { ...snapshot().seller, phone: "" } })
    expect(eInvoiceProblems(input(bare), "xrechnung")).toHaveLength(3)
    expect(eInvoiceProblems(input(bare), "en16931")).toEqual([])
  })
})
