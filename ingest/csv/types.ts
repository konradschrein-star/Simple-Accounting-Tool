import { z } from "zod"
import type { RowIssue } from "@/db/schema"

const column = z.number().int().min(0).optional()

/** Single source of truth for a column mapping: validates user edits and types the stored JSON. */
export const csvMappingSchema = z.object({
  headerRow: z.number().int().min(0),
  columns: z.object({
    date: column,
    description: column,
    counterparty: column,
    amount: column,
    debit: column,
    credit: column,
    balance: column,
    currency: column,
    indicator: column,
  }),
  amountMode: z.enum(["signed", "debitCredit", "indicator"]),
  dateFormat: z.enum(["dmy", "mdy", "ymd"]),
  decimal: z.enum([".", ","]),
  flipSign: z.boolean(),
})

export type CsvMapping = z.infer<typeof csvMappingSchema>
export type DateFormat = CsvMapping["dateFormat"]
export type AmountMode = CsvMapping["amountMode"]
export type StoredCsvMapping = CsvMapping & { fingerprint: string }

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
