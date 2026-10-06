import type { RowIssue } from "@/db/schema"
import type { CsvMapping, NormalizedRow } from "./types"
import { isDebitIndicator, parseBankAmount, parseBankDate } from "./values"

/** Applies a (detected or user-edited) mapping to raw CSV rows. Unparseable rows are kept and flagged, never dropped. */
export function normalizeRows(rows: string[][], mapping: CsvMapping): NormalizedRow[] {
  const { columns, decimal } = mapping
  const cell = (row: string[], col: number | undefined) => (col === undefined ? "" : (row[col] ?? "").trim())
  const amount = (value: string) => (value ? parseBankAmount(value, decimal) : null)

  return rows
    .slice(mapping.headerRow + 1)
    .map((row, index) => ({ row, rowIndex: mapping.headerRow + 1 + index }))
    .filter(({ row }) => row.some((c) => c.trim()))
    .map(({ row, rowIndex }) => {
      const issues: RowIssue[] = []
      const date = parseBankDate(cell(row, columns.date), mapping.dateFormat)
      if (!date) issues.push("unparseable_date")

      let amountMinor: number | null
      if (mapping.amountMode === "debitCredit") {
        const debit = amount(cell(row, columns.debit))
        const credit = amount(cell(row, columns.credit))
        amountMinor = debit === null && credit === null ? null : Math.abs(credit ?? 0) - Math.abs(debit ?? 0)
      } else {
        const value = amount(cell(row, columns.amount))
        amountMinor =
          value === null ? null : mapping.amountMode === "indicator" ? (isDebitIndicator(cell(row, columns.indicator)) ? -Math.abs(value) : Math.abs(value)) : value
      }
      if (amountMinor === null) issues.push("unparseable_amount")
      else if (mapping.flipSign) amountMinor = -amountMinor

      const description = cell(row, columns.description)
      const counterparty = cell(row, columns.counterparty)
      return {
        rowIndex,
        date,
        description: description || counterparty,
        counterparty,
        amountMinor,
        balanceMinor: amount(cell(row, columns.balance)),
        raw: row,
        issues,
      }
    })
}
