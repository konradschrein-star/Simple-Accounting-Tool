import { and, eq, gte, inArray, lte, ne } from "drizzle-orm"
import type { Db } from "@/db/client"
import { invoicePayments, invoices, ledgerAccounts, transactions } from "@/db/schema"
import type { Jurisdiction } from "@/jurisdictions"
import type { IsoDate } from "@/lib/dates"
import { summarizeVat, type VatPurchase, type VatSalesDoc, type VatSummary } from "@/tax/vat-return"
import type { WorkspaceSettings } from "./workspace"

/** Output tax from issued invoices and credit notes, input tax from expenses booked in the period. */
export function vatSummary(db: Db, orgId: string, jurisdiction: Jurisdiction, settings: WorkspaceSettings, period: { from: IsoDate; to: IsoDate }): VatSummary {
  const docs = db
    .select({ id: invoices.id, kind: invoices.kind, status: invoices.status, issueDate: invoices.issueDate, fxRateMicro: invoices.fxRateMicro, totalMinor: invoices.totalMinor, snapshot: invoices.snapshot, relatedId: invoices.relatedId })
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), inArray(invoices.kind, ["invoice", "credit_note"]), ne(invoices.status, "draft")))
    .all()
  const payments = db.select({ invoiceId: invoicePayments.invoiceId, date: invoicePayments.date, amountMinor: invoicePayments.amountMinor }).from(invoicePayments).where(eq(invoicePayments.orgId, orgId)).all()
  const paymentsBy = Map.groupBy(payments, (p) => p.invoiceId)
  const sales: VatSalesDoc[] = docs.map((d) => ({
    kind: d.kind as VatSalesDoc["kind"],
    status: d.status,
    issueDate: d.issueDate,
    fxRateMicro: d.fxRateMicro,
    totalMinor: d.totalMinor,
    taxGroups: d.snapshot?.taxGroups ?? [],
    payments: paymentsBy.get(d.id) ?? [],
    relatedPaid: d.relatedId ? (paymentsBy.get(d.relatedId)?.length ?? 0) > 0 : false,
  }))

  // Not registered (or §19): nothing to reclaim, whatever the receipts say.
  const reclaims = settings.taxRegistered && !settings.smallBusinessExempt
  const expenses = db
    .select({ date: transactions.date, amountMinor: transactions.amountMinor, vatRateBp: transactions.vatRateBp, code: ledgerAccounts.code, accountRate: ledgerAccounts.inputVatBp })
    .from(transactions)
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, transactions.ledgerAccountId))
    .where(and(eq(transactions.orgId, orgId), eq(ledgerAccounts.kind, "expense"), gte(transactions.date, period.from), lte(transactions.date, period.to)))
    .all()
  const purchases: VatPurchase[] = expenses.map((e) => ({
    date: e.date,
    amountMinor: e.amountMinor,
    rateBp: reclaims ? (e.vatRateBp ?? e.accountRate ?? jurisdiction.inputTax.byAccount[e.code] ?? jurisdiction.inputTax.standardBp) : 0,
  }))
  return summarizeVat(sales, purchases, period, settings.vatAccounting)
}
