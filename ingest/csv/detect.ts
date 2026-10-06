import { createHash } from "node:crypto"
import Papa from "papaparse"
import { JURISDICTIONS } from "@/jurisdictions"
import type { CsvRole, JurisdictionCode } from "@/jurisdictions/types"
import type { AmountMode, CsvDetection, CsvMapping } from "./types"
import { inferDateFormat, inferDecimal, isDebitIndicator, looksLikeDate, looksNumeric, normalizeHeader } from "./values"

/** Synonyms from every jurisdiction (people bank abroad) plus a few bank-specific spellings. */
const SYNONYMS: Record<CsvRole, string[]> = (() => {
  const merged: Record<string, Set<string>> = {}
  for (const j of Object.values(JURISDICTIONS))
    for (const [role, words] of Object.entries(j.csvSynonyms)) for (const w of words) (merged[role] ??= new Set()).add(w)
  merged.counterparty.add("zahlungsempfängerin")
  merged.counterparty.add("payee name")
  merged.indicator.add("soll/haben")
  merged.date.add("buchungsdatum")
  return Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, [...v]])) as Record<CsvRole, string[]>
})()

function roleScore(header: string, role: CsvRole): number {
  let best = 0
  for (const synonym of SYNONYMS[role] ?? []) {
    if (header === synonym) return 3
    if (header.startsWith(synonym)) best = Math.max(best, 2)
    else if (synonym.length >= 4 && header.includes(synonym)) best = Math.max(best, 1)
  }
  return best
}

const ROLES: CsvRole[] = ["date", "amount", "debit", "credit", "balance", "description", "counterparty", "currency", "indicator"]

export function decodeCsv(bytes: Uint8Array): string {
  let text = new TextDecoder("utf-8").decode(bytes)
  if (text.includes("�")) text = new TextDecoder("windows-1252").decode(bytes)
  return text.replace(/^﻿/, "")
}

export function parseCsv(text: string): string[][] {
  const result = Papa.parse<string[]>(text.trim(), { skipEmptyLines: "greedy", delimitersToGuess: [";", ",", "\t", "|"] })
  return result.data.map((row) => row.map((cell) => (cell ?? "").trim()))
}

function findHeaderRow(rows: string[][]): number {
  let bestIndex = 0
  let bestScore = -1
  rows.slice(0, 25).forEach((row, index) => {
    const hits = row.filter((cell) => ROLES.some((role) => roleScore(normalizeHeader(cell), role) >= 2)).length
    const next = rows[index + 1]
    const consistent = next && next.length === row.length ? 1 : 0
    const dataLooksLikeData = next?.some(looksLikeDate) ? 1 : 0
    const score = hits * 2 + consistent + dataLooksLikeData
    if (hits >= 2 && score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  })
  return bestIndex
}

const avgLength = (rows: string[][], col: number) => rows.reduce((s, r) => s + (r[col]?.length ?? 0), 0) / Math.max(rows.length, 1)
const rate = (rows: string[][], col: number, test: (v: string) => boolean) =>
  rows.filter((r) => r[col] && test(r[col])).length / Math.max(rows.filter((r) => r[col]).length, 1)

function assignRoles(header: string[], data: string[][]): { columns: CsvMapping["columns"]; bySynonym: Set<CsvRole> } {
  const candidates: { role: CsvRole; col: number; score: number; tiebreak: number }[] = []
  header.forEach((cell, col) => {
    const h = normalizeHeader(cell)
    for (const role of ROLES) {
      const score = roleScore(h, role)
      // Prefer the wordiest column for descriptions, the most date-like for dates.
      const tiebreak = role === "description" ? avgLength(data, col) : role === "date" ? rate(data, col, looksLikeDate) : 0
      if (score) candidates.push({ role, col, score, tiebreak })
    }
  })
  candidates.sort((a, b) => b.score - a.score || b.tiebreak - a.tiebreak || a.col - b.col)
  const columns: CsvMapping["columns"] = {}
  const usedCols = new Set<number>()
  for (const c of candidates) {
    if (columns[c.role] !== undefined || usedCols.has(c.col)) continue
    if (
      (c.role === "date" && rate(data, c.col, looksLikeDate) < 0.6) ||
      (["amount", "debit", "credit", "balance"].includes(c.role) && rate(data, c.col, looksNumeric) < 0.5)
    )
      continue
    columns[c.role] = c.col
    usedCols.add(c.col)
  }
  const bySynonym = new Set(Object.keys(columns) as CsvRole[])

  // Content sniffing for anything the headers did not reveal.
  const free = header.map((_, i) => i).filter((i) => !usedCols.has(i))
  if (columns.date === undefined) {
    const col = free.find((i) => rate(data, i, looksLikeDate) >= 0.8)
    if (col !== undefined) {
      columns.date = col
      usedCols.add(col)
    }
  }
  if (columns.amount === undefined && columns.debit === undefined) {
    const col = free.filter((i) => !usedCols.has(i)).find((i) => rate(data, i, looksNumeric) >= 0.9 && data.some((r) => /-|\(/.test(r[i] ?? "")))
    if (col !== undefined) {
      columns.amount = col
      usedCols.add(col)
    }
  }
  if (columns.description === undefined) {
    const col = free.filter((i) => !usedCols.has(i)).sort((a, b) => avgLength(data, b) - avgLength(data, a))[0]
    if (col !== undefined) columns.description = col
  }
  return { columns, bySynonym }
}

function chooseAmountMode(columns: CsvMapping["columns"], data: string[][]): AmountMode {
  if (columns.amount === undefined) return columns.debit !== undefined || columns.credit !== undefined ? "debitCredit" : "signed"
  const hasNegatives = data.some((r) => /^\s*-|\(|-\s*$/.test(r[columns.amount!] ?? ""))
  const indicatorWorks = columns.indicator !== undefined && data.some((r) => isDebitIndicator(r[columns.indicator!] ?? ""))
  return !hasNegatives && indicatorWorks ? "indicator" : "signed"
}

export function fingerprintHeader(header: string[]): string {
  return createHash("sha256").update(header.map(normalizeHeader).join("|")).digest("hex").slice(0, 32)
}

export function detectCsv(text: string, jurisdiction: JurisdictionCode): CsvDetection {
  const rows = parseCsv(text)
  const headerRow = findHeaderRow(rows)
  const header = rows[headerRow] ?? []
  const data = rows.slice(headerRow + 1).filter((r) => r.length >= Math.min(2, header.length))
  const sample = data.slice(0, 50)
  const { columns, bySynonym } = assignRoles(header, sample)
  const amountMode = chooseAmountMode(columns, sample)
  const dateValues = columns.date === undefined ? [] : data.map((r) => r[columns.date!] ?? "")
  const { format, ambiguous } = inferDateFormat(dateValues, jurisdiction === "us" ? "mdy" : "dmy")
  const numberValues = (["amount", "debit", "credit", "balance"] as const).flatMap((role) =>
    columns[role] === undefined ? [] : sample.map((r) => r[columns[role]!] ?? "")
  )
  const decimal = inferDecimal(numberValues, jurisdiction === "de" ? "," : ".")
  const hasAmount = amountMode === "debitCredit" ? columns.debit !== undefined || columns.credit !== undefined : columns.amount !== undefined
  return {
    rows,
    header,
    mapping: { headerRow, columns, amountMode, dateFormat: format, decimal, flipSign: false },
    confident: bySynonym.has("date") && hasAmount && !ambiguous && columns.description !== undefined,
    dateFormatAmbiguous: ambiguous,
    fingerprint: fingerprintHeader(header),
  }
}
