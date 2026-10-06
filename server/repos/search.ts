import { and, desc, eq, or, sql, type AnyColumn } from "drizzle-orm"
import type { Db } from "@/db/client"
import { clients, invoices, transactions } from "@/db/schema"

/** LIKE pattern with the user's wildcards escaped, so "50%" searches for a literal percent sign. */
const pattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

/** Quick lookup for the command menu: a handful of hits per kind, newest first. */
export function searchWorkspace(db: Db, orgId: string, q: string) {
  const p = pattern(q)
  const escaped = (column: AnyColumn) => sql`${column} like ${p} escape ${"\\"}`
  const docs = db
    .select({ id: invoices.id, number: invoices.number, kind: invoices.kind, status: invoices.status, dueDate: invoices.dueDate, totalMinor: invoices.totalMinor, currency: invoices.currency, clientName: clients.name })
    .from(invoices)
    .leftJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.orgId, invoices.orgId)))
    .where(and(eq(invoices.orgId, orgId), or(escaped(invoices.number), escaped(clients.name), escaped(invoices.notes))))
    .orderBy(desc(invoices.issueDate))
    .limit(6)
    .all()
  const people = db
    .select({ id: clients.id, name: clients.name, email: clients.email })
    .from(clients)
    .where(and(eq(clients.orgId, orgId), or(escaped(clients.name), escaped(clients.email))))
    .limit(5)
    .all()
  const txns = db
    .select({ id: transactions.id, date: transactions.date, description: transactions.description, counterparty: transactions.counterparty, amountMinor: transactions.amountMinor })
    .from(transactions)
    .where(and(eq(transactions.orgId, orgId), or(escaped(transactions.description), escaped(transactions.counterparty))))
    .orderBy(desc(transactions.date))
    .limit(6)
    .all()
  return { documents: docs, clients: people, transactions: txns }
}

export type SearchResults = ReturnType<typeof searchWorkspace>
