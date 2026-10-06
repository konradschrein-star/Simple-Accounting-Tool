import { and, desc, eq, or, type AnyColumn } from "drizzle-orm"
import type { Db } from "@/db/client"
import { containsText } from "@/db/like"
import { clients, invoices, transactions } from "@/db/schema"
import { paidAmounts } from "./invoices"

/** Quick lookup for the command menu: a handful of hits per kind, newest first. */
export function searchWorkspace(db: Db, orgId: string, q: string) {
  const contains = (column: AnyColumn) => containsText(column, q)
  const docs = db
    .select({
      id: invoices.id,
      number: invoices.number,
      kind: invoices.kind,
      status: invoices.status,
      dueDate: invoices.dueDate,
      totalMinor: invoices.totalMinor,
      currency: invoices.currency,
      clientName: clients.name,
    })
    .from(invoices)
    .leftJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.orgId, invoices.orgId)))
    .where(and(eq(invoices.orgId, orgId), or(contains(invoices.number), contains(clients.name), contains(invoices.notes))))
    .orderBy(desc(invoices.issueDate))
    .limit(6)
    .all()
  const people = db
    .select({ id: clients.id, name: clients.name, email: clients.email })
    .from(clients)
    .where(and(eq(clients.orgId, orgId), or(contains(clients.name), contains(clients.email))))
    .limit(5)
    .all()
  const txns = db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      counterparty: transactions.counterparty,
      amountMinor: transactions.amountMinor,
    })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), or(contains(transactions.description), contains(transactions.counterparty))))
    .orderBy(desc(transactions.date))
    .limit(6)
    .all()
  const paid = paidAmounts(
    db,
    orgId,
    docs.map((d) => d.id)
  )
  return { documents: docs.map((d) => ({ ...d, paidMinor: paid.get(d.id) ?? 0 })), clients: people, transactions: txns }
}

export type SearchResults = ReturnType<typeof searchWorkspace>
