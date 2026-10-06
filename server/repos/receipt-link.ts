import { eq, type AnyColumn } from "drizzle-orm"
import type { Db } from "@/db/client"
import { attachments } from "@/db/schema"

/** The single definition of "this transaction has a receipt", usable in any query over transactions. */
export const hasReceipt = (db: Db, transactionId: AnyColumn) =>
  db.select({ id: attachments.id }).from(attachments).where(eq(attachments.transactionId, transactionId))
