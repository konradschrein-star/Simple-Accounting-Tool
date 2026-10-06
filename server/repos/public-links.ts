import { and, eq, isNull } from "drizzle-orm"
import type { Db } from "@/db/client"
import { invoices } from "@/db/schema"
import { isIssued, logEvent, paidAmounts, type Invoice, type IssuedDocument } from "./invoices"

/** Resolves a share link. Tokens are 32 random characters; only issued documents have one. */
export function findByPublicToken(db: Db, token: string): { invoice: IssuedDocument; paidMinor: number } | null {
  if (typeof token !== "string" || !/^[\w-]{32}$/.test(token)) return null
  const invoice = db.select().from(invoices).where(eq(invoices.publicToken, token)).get()
  if (!invoice || !isIssued(invoice)) return null
  return { invoice, paidMinor: paidAmounts(db, invoice.orgId, [invoice.id]).get(invoice.id) ?? 0 }
}

/** Records the first time the client opens the link. */
export function markViewed(db: Db, invoice: Invoice) {
  db.transaction(() => {
    const result = db
      .update(invoices)
      .set({ viewedAt: new Date() })
      .where(and(eq(invoices.id, invoice.id), isNull(invoices.viewedAt)))
      .run()
    if (result.changes) logEvent(db, invoice.orgId, invoice.id, "viewed", null)
  })
}
