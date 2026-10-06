import type { Db } from "@/db/client"
import { defaultInputTaxBp, type Jurisdiction } from "@/jurisdictions"
import type { IsoDate } from "@/lib/dates"
import { invoiceNumbers } from "./invoices"
import { getTransaction, isPeriodOpen, listAccounts } from "./ledger"
import { receiptForTransaction } from "./receipts"

export type TransactionDetail = {
  id: string
  date: IsoDate
  description: string
  counterparty: string
  amountMinor: number
  accountId: string | null
  note: string
  vatRateBp: number | null
  /** Rate the VAT return uses when none is set: the account's usual one (null for non-expense accounts). */
  defaultVatRateBp: number | null
  locked: boolean
  invoice: { id: string; number: string | null } | null
  receipt: {
    id: string
    filename: string
    mimeType: string
    reading: boolean
    vendor: string | null
    totalMinor: number | null
    currency: string | null
  } | null
}

/** Everything the transaction sheet shows, or null when the id isn't this workspace's. */
export function transactionDetail(db: Db, orgId: string, jurisdiction: Jurisdiction, id: string): TransactionDetail | null {
  const txn = getTransaction(db, orgId, id)
  if (!txn) return null
  const account = listAccounts(db, orgId).find((a) => a.id === txn.ledgerAccountId)
  const receipt = receiptForTransaction(db, orgId, id)
  return {
    id: txn.id,
    date: txn.date,
    description: txn.description,
    counterparty: txn.counterparty,
    amountMinor: txn.amountMinor,
    accountId: txn.ledgerAccountId,
    note: txn.note,
    vatRateBp: txn.vatRateBp,
    defaultVatRateBp: account?.kind === "expense" ? defaultInputTaxBp(jurisdiction, account.code) : null,
    locked: !isPeriodOpen(db, orgId, txn.date),
    invoice: txn.invoiceId ? { id: txn.invoiceId, number: invoiceNumbers(db, orgId, [txn.invoiceId]).get(txn.invoiceId) ?? null } : null,
    receipt: receipt && {
      id: receipt.id,
      filename: receipt.filename,
      mimeType: receipt.mimeType,
      reading: receipt.readStatus === "processing",
      vendor: receipt.extracted?.vendor ?? null,
      totalMinor: receipt.extracted?.totalMinor ?? null,
      currency: receipt.extracted?.currency ?? null,
    },
  }
}
