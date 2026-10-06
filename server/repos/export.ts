import { eq, inArray } from "drizzle-orm"
import type { Db } from "@/db/client"
import * as t from "@/db/schema"

/** Every row a workspace owns (GDPR export). */
export function exportWorkspace(db: Db, orgId: string) {
  const invoices = db.select().from(t.invoices).where(eq(t.invoices.orgId, orgId)).all()
  const batches = db.select().from(t.importBatches).where(eq(t.importBatches.orgId, orgId)).all()
  return {
    clients: db.select().from(t.clients).where(eq(t.clients.orgId, orgId)).all(),
    invoices,
    invoiceItems: invoices.length
      ? db
          .select()
          .from(t.invoiceItems)
          .where(
            inArray(
              t.invoiceItems.invoiceId,
              invoices.map((i) => i.id)
            )
          )
          .all()
      : [],
    importBatches: batches,
    importRows: batches.length
      ? db
          .select()
          .from(t.importRows)
          .where(
            inArray(
              t.importRows.batchId,
              batches.map((b) => b.id)
            )
          )
          .all()
      : [],
    transactions: db.select().from(t.transactions).where(eq(t.transactions.orgId, orgId)).all(),
    ledgerAccounts: db.select().from(t.ledgerAccounts).where(eq(t.ledgerAccounts.orgId, orgId)).all(),
    categorizationRules: db.select().from(t.categorizationRules).where(eq(t.categorizationRules.orgId, orgId)).all(),
    periodCloses: db.select().from(t.periodCloses).where(eq(t.periodCloses.orgId, orgId)).all(),
    advisoryAlerts: db.select().from(t.advisoryAlerts).where(eq(t.advisoryAlerts.orgId, orgId)).all(),
    advisoryRequests: db.select().from(t.advisoryRequests).where(eq(t.advisoryRequests.orgId, orgId)).all(),
    auditLog: db.select().from(t.auditLog).where(eq(t.auditLog.orgId, orgId)).all(),
  }
}
