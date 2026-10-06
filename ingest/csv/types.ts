import type { RowIssue } from "@/db/schema"
import type { CsvRole } from "@/jurisdictions/types"

export type DateFormat = "dmy" | "mdy" | "ymd"
export type AmountMode = "signed" | "debitCredit" | "indicator"

export type CsvMapping = {
  headerRow: number
  columns: Partial<Record<CsvRole, number>>
  amountMode: AmountMode
  dateFormat: DateFormat
  decimal: "." | ","
  flipSign: boolean
}

export type CsvDetection = {
  rows: string[][]
  header: string[]
  mapping: CsvMapping
  /** True when the mapping can be applied without asking the user. */
  confident: boolean
  dateFormatAmbiguous: boolean
  fingerprint: string
}

export type NormalizedRow = {
  rowIndex: number
  date: string | null
  description: string
  counterparty: string
  amountMinor: number | null
  balanceMinor: number | null
  raw: string[]
  issues: RowIssue[]
}
