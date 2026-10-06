import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { decodeCsv, detectCsv } from "@/ingest/csv/detect"
import { normalizeRows } from "@/ingest/csv/normalize"
import type { JurisdictionCode } from "@/jurisdictions/types"

function load(name: string, jurisdiction: JurisdictionCode) {
  const text = decodeCsv(new Uint8Array(fs.readFileSync(path.join(__dirname, "../fixtures/csv", name))))
  const detection = detectCsv(text, jurisdiction)
  return { detection, rows: normalizeRows(detection.rows, detection.mapping) }
}

const summary = (rows: ReturnType<typeof normalizeRows>) => rows.map((r) => [r.date, r.amountMinor, r.issues.length])

describe("CSV detection across real bank formats", () => {
  it("Sparkasse: semicolons, 2-digit years, decimal comma", () => {
    const { detection, rows } = load("sparkasse.csv", "de")
    expect(detection.confident).toBe(true)
    expect(summary(rows)).toEqual([
      ["2026-10-01", 148750, 0],
      ["2026-10-02", -85000, 0],
      ["2026-10-15", -6645, 0],
    ])
    expect(rows[1].counterparty).toBe("Hausverwaltung Schmidt")
    expect(rows[1].description).toBe("Miete Oktober Buero")
  })

  it("DKB: skips the account preamble and parses thousands separators", () => {
    const { detection, rows } = load("dkb.csv", "de")
    expect(detection.header[0]).toBe("Buchungsdatum")
    expect(summary(rows)).toEqual([
      ["2026-10-30", -4999, 0],
      ["2026-10-28", 238000, 0],
    ])
  })

  it("N26: ISO dates and decimal dots", () => {
    const { rows } = load("n26.csv", "de")
    expect(summary(rows)).toEqual([
      ["2026-10-01", -3868, 0],
      ["2026-10-03", 120000, 0],
    ])
    expect(rows[0].counterparty).toBe("Hetzner Online GmbH")
  })

  it("Monzo: dd/mm/yyyy, signed amounts", () => {
    const { detection, rows } = load("monzo.csv", "uk")
    expect(detection.mapping.dateFormat).toBe("dmy")
    expect(summary(rows)).toEqual([
      ["2026-10-01", -645, 0],
      ["2026-10-13", 240000, 0],
    ])
  })

  it("Barclays: memo as description", () => {
    const { rows } = load("barclays.csv", "uk")
    expect(summary(rows)).toEqual([
      ["2026-10-02", -12000, 0],
      ["2026-10-14", 95000, 0],
    ])
    expect(rows[0].description).toContain("BRITISH GAS")
  })

  it("Chase: mm/dd/yyyy and the wordy Description column wins over Details", () => {
    const { detection, rows } = load("chase.csv", "us")
    expect(detection.mapping.dateFormat).toBe("mdy")
    expect(summary(rows)).toEqual([
      ["2026-10-02", -5499, 0],
      ["2026-10-14", 320000, 0],
      ["2026-10-20", -180000, 0],
    ])
    expect(rows[0].description).toContain("ADOBE")
    expect(rows[0].balanceMinor).toBe(1024501)
  })

  it("Paid out / paid in split columns", () => {
    const { detection, rows } = load("paid-in-out.csv", "uk")
    expect(detection.mapping.amountMode).toBe("debitCredit")
    expect(summary(rows)).toEqual([
      ["2026-10-03", -2340, 0],
      ["2026-10-05", 150000, 0],
    ])
  })

  it("Windows-1252 exports decode umlauts", () => {
    const { rows } = load("cp1252.csv", "de")
    expect(rows[0].description).toBe("Bürobedarf März")
    expect(summary(rows)).toEqual([
      ["2026-10-05", -2390, 0],
      ["2026-10-06", 100000, 0],
    ])
  })

  it("flags ambiguous date orders and keeps unparseable rows", () => {
    const detection = detectCsv("Date,Description,Amount\n01/02/2026,Coffee,-3.50\nnot a date,Broken,abc", "uk")
    expect(detection.dateFormatAmbiguous).toBe(true)
    expect(detection.confident).toBe(false)
    const rows = normalizeRows(detection.rows, detection.mapping)
    expect(rows[1].issues).toEqual(["unparseable_date", "unparseable_amount"])
  })

  it("flip sign for banks that export debits as positive", () => {
    const detection = detectCsv("Date,Description,Amount\n15/01/2026,Rent,850.00", "uk")
    expect(normalizeRows(detection.rows, { ...detection.mapping, flipSign: true })[0].amountMinor).toBe(-85000)
  })
})

describe("currency guard", () => {
  it("flags rows in another currency than the workspace", () => {
    const detection = detectCsv("Date,Description,Amount,Currency\n01/10/2026,Hotel,-120.00,USD\n02/10/2026,Coffee,-3.50,GBP", "uk")
    const rows = normalizeRows(detection.rows, detection.mapping, "GBP")
    expect(rows.map((r) => r.issues)).toEqual([["foreign_currency"], []])
  })
})
