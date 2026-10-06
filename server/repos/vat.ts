import { and, between, eq, inArray, isNotNull, or } from "drizzle-orm"
import type { Db } from "@/db/client"
import { invoicePayments, invoices, ledgerAccounts, transactions } from "@/db/schema"
import { accountTemplate, type Jurisdiction } from "@/jurisdictions"
import { reclaimsInputTax } from "@/jurisdictions/tax-profile"
import type { IsoDate } from "@/lib/dates"
import { summarizeVat, type VatPurchase, type VatSalesDoc, type VatSummary } from "@/tax/vat-return"
import { paidAmounts } from "./invoices"
import type { WorkspaceSettings } from "./workspace"

type Period = { from: IsoDate; to: IsoDate }

/** Issued invoices (cancelled ones too — their credit note nets them out) and issued credit notes. */
const issuedSales = or(
  and(eq(invoices.kind, "invoice"), inArray(invoices.status, ["finalized", "paid", "cancelled"])),
  and(eq(invoices.kind, "credit_note"), eq(invoices.status, "finalized"))
)

/**
 * The documents whose tax falls into the period: by issue date (accrual), or — for cash accounting — invoices
 * paid in the period (with just those payments) and credit notes issued in it.
 */
function salesForPeriod(db: Db, orgId: string, period: Period, accounting: "accrual" | "cash"): VatSalesDoc[] {
  const paidInPeriod =
    accounting === "cash"
      ? db
          .select({ invoiceId: invoicePayments.invoiceId, date: invoicePayments.date, amountMinor: invoicePayments.amountMinor })
          .from(invoicePayments)
          .where(and(eq(invoicePayments.orgId, orgId), between(invoicePayments.date, period.from, period.to)))
          .all()
      : []
  const payments = Map.groupBy(paidInPeriod, (p) => p.invoiceId)
  const issuedInPeriod = between(invoices.issueDate, period.from, period.to)
  const relevant =
    accounting === "accrual" ? issuedInPeriod : or(and(eq(invoices.kind, "credit_note"), issuedInPeriod), inArray(invoices.id, [...payments.keys()]))
  const docs = db
    .select({
      id: invoices.id,
      kind: invoices.kind,
      issueDate: invoices.issueDate,
      fxRateMicro: invoices.fxRateMicro,
      totalMinor: invoices.totalMinor,
      snapshot: invoices.snapshot,
      relatedId: invoices.relatedId,
    })
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), issuedSales, isNotNull(invoices.snapshot), relevant))
    .all()

  // Cash accounting reverses only the paid share of a corrected invoice.
  const correctedIds = docs.filter((d) => d.kind === "credit_note" && d.relatedId).map((d) => d.relatedId!)
  const correctedPaid = paidAmounts(db, orgId, correctedIds)
  const correctedTotals = new Map(
    correctedIds.length
      ? db
          .select({ id: invoices.id, total: invoices.totalMinor })
          .from(invoices)
          .where(and(eq(invoices.orgId, orgId), inArray(invoices.id, correctedIds)))
          .all()
          .map((i) => [i.id, i.total])
      : []
  )
  return docs.map((d) => ({
    kind: d.kind === "credit_note" ? "credit_note" : "invoice",
    issueDate: d.issueDate,
    fxRateMicro: d.fxRateMicro,
    totalMinor: d.totalMinor,
    taxGroups: d.snapshot!.taxGroups,
    payments: payments.get(d.id) ?? [],
    corrected:
      d.kind === "credit_note" && d.relatedId
        ? { paidMinor: correctedPaid.get(d.relatedId) ?? 0, totalMinor: correctedTotals.get(d.relatedId) ?? 0 }
        : undefined,
  }))
}

/** Expenses booked in the period, with the input-tax rate each carries (receipt, explicit choice, or the account's usual one). */
function purchasesForPeriod(db: Db, orgId: string, jurisdiction: Jurisdiction, settings: WorkspaceSettings, period: Period): VatPurchase[] {
  // Not registered (or exempt): nothing to reclaim, whatever the receipts say.
  const reclaims = reclaimsInputTax(jurisdiction, settings)
  return db
    .select({ date: transactions.date, amountMinor: transactions.amountMinor, vatRateBp: transactions.vatRateBp, code: ledgerAccounts.code })
    .from(transactions)
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, transactions.ledgerAccountId))
    .where(and(eq(transactions.orgId, orgId), eq(ledgerAccounts.kind, "expense"), between(transactions.date, period.from, period.to)))
    .all()
    .map((e) => {
      const template = accountTemplate(jurisdiction, e.code)
      return { date: e.date, amountMinor: e.amountMinor, rateBp: reclaims ? (e.vatRateBp ?? template?.inputTaxBp ?? 0) : 0, outOfScope: !!template?.outOfScope }
    })
}

export function vatSummary(db: Db, orgId: string, jurisdiction: Jurisdiction, settings: WorkspaceSettings, period: Period): VatSummary {
  return summarizeVat(
    salesForPeriod(db, orgId, period, settings.vatAccounting),
    purchasesForPeriod(db, orgId, jurisdiction, settings, period),
    period,
    settings.vatAccounting
  )
}
