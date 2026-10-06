import { describe, expect, it } from "vitest"
import { JURISDICTIONS, type TaxProfile } from "@/jurisdictions"
import { todayIn } from "@/lib/dates"

const base: TaxProfile = {
  taxRegistered: true,
  smallBusinessExempt: false,
  vatFilingFrequency: "quarterly",
  vatPeriodEndMonth: 3,
  deDauerfrist: false,
}
const FROM = "2026-10-01"
const TO = "2027-12-31"
const dates = (code: keyof typeof JURISDICTIONS, profile: TaxProfile, prefix: string) =>
  JURISDICTIONS[code]
    .taxDeadlines(profile, FROM, TO)
    .filter((d) => d.id.startsWith(prefix))
    .map((d) => d.date)

describe("tax deadlines (pinned to verified dates, appendix of the build plan)", () => {
  it("DE USt-VA monthly shifts weekends (§108 AO)", () => {
    const monthly = dates("de", { ...base, vatFilingFrequency: "monthly" }, "de-ustva")
    expect(monthly).toEqual(expect.arrayContaining(["2026-10-12", "2026-11-10", "2026-12-10", "2027-01-11", "2027-04-12", "2027-07-12", "2027-10-11"]))
  })
  it("DE USt-VA quarterly and Dauerfrist", () => {
    expect(dates("de", base, "de-ustva")).toEqual(["2026-10-12", "2027-01-11", "2027-04-12", "2027-07-12", "2027-10-11"])
    expect(dates("de", { ...base, deDauerfrist: true }, "de-ustva-2026-Q3")).toEqual(["2026-11-10"])
  })
  it("DE Kleinunternehmer has no USt-VA", () => {
    expect(dates("de", { ...base, smallBusinessExempt: true }, "de-ustva")).toEqual([])
  })
  it("DE income tax prepayments and annual return", () => {
    expect(dates("de", base, "de-est-vz")).toEqual(["2026-12-10", "2027-03-10", "2027-06-10", "2027-09-10", "2027-12-10"])
    expect(dates("de", base, "de-annual-2026")).toEqual(["2027-08-02"])
  })
  it("UK VAT (1 month + 7 days, no weekend shift), SA and MTD", () => {
    expect(dates("uk", { ...base, vatPeriodEndMonth: 3 }, "uk-vat")).toEqual(["2026-11-07", "2027-02-07", "2027-05-07", "2027-08-07", "2027-11-07"])
    expect(dates("uk", base, "uk-sa")).toEqual(["2027-01-31", "2027-07-31"])
    expect(dates("uk", base, "uk-mtd")).toEqual(["2026-11-07", "2027-02-07", "2027-05-07", "2027-08-07", "2027-11-07"])
  })
  it("US estimated tax with holiday shifts", () => {
    expect(dates("us", base, "us-")).toEqual(["2027-01-15", "2027-04-15", "2027-06-15", "2027-09-15"])
    expect(JURISDICTIONS.us.taxDeadlines(base, "2028-01-01", "2028-01-31").map((d) => d.date)).toEqual(["2028-01-18"])
  })
  it("JE GST quarters, return and payments on account", () => {
    expect(dates("je", { ...base, vatPeriodEndMonth: 3 }, "je-gst")).toEqual(["2026-10-31", "2027-01-31", "2027-04-30", "2027-07-31", "2027-10-31"])
    expect(dates("je", base, "je-return")).toEqual(["2027-07-31"])
    expect(dates("je", base, "je-poa")).toEqual(["2026-11-30", "2027-05-31", "2027-11-30"])
  })
})

describe("invoice rules", () => {
  it("DE requires service date and tax id; §19 note", () => {
    expect(JURISDICTIONS.de.requiredInvoiceFields(base)).toContain("serviceDate")
    expect(JURISDICTIONS.de.exemptionNote({ ...base, smallBusinessExempt: true })).toMatch(/§19 UStG/)
  })
  it("UK non-registered needs no VAT number", () => {
    expect(JURISDICTIONS.uk.requiredInvoiceFields({ ...base, taxRegistered: false })).not.toContain("sellerTaxId")
  })
  it("every chart of accounts has income, expense, transfer and owner kinds with unique codes", () => {
    for (const j of Object.values(JURISDICTIONS)) {
      const kinds = new Set(j.chartOfAccounts.map((a) => a.kind))
      for (const k of ["income", "expense", "transfer", "owner"]) expect(kinds.has(k as never)).toBe(true)
      expect(new Set(j.chartOfAccounts.map((a) => a.code)).size).toBe(j.chartOfAccounts.length)
    }
  })
})

describe("todayIn", () => {
  it("respects the workspace timezone", () => {
    const instant = new Date("2026-12-31T23:30:00Z")
    expect(todayIn("Europe/Berlin", instant)).toBe("2027-01-01")
    expect(todayIn("America/New_York", instant)).toBe("2026-12-31")
  })
})

describe("tax profile normalization", async () => {
  const { normalizeTaxProfile } = await import("@/jurisdictions/tax-profile")
  const input = { taxRegistered: true, smallBusinessExempt: true, vatFilingFrequency: "quarterly" as const, vatPeriodEndMonth: 3, deDauerfrist: true }
  it("DE Kleinunternehmer: exempt, not registered, no filing, 0 % default", () => {
    expect(normalizeTaxProfile(JURISDICTIONS.de, input)).toEqual({
      taxRegistered: false,
      smallBusinessExempt: true,
      vatFilingFrequency: "none",
      vatPeriodEndMonth: 3,
      deDauerfrist: false,
      defaultTaxRateBp: 0,
    })
  })
  it("the §19 exemption does not exist in the UK", () => {
    expect(normalizeTaxProfile(JURISDICTIONS.uk, input)).toMatchObject({ taxRegistered: true, smallBusinessExempt: false, defaultTaxRateBp: 2000 })
  })
  it("unregistered businesses have no filing schedule", () => {
    expect(normalizeTaxProfile(JURISDICTIONS.je, { ...input, taxRegistered: false, smallBusinessExempt: false })).toMatchObject({
      vatFilingFrequency: "none",
      defaultTaxRateBp: 0,
    })
  })
})
