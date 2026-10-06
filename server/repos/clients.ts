import { and, asc, count, eq } from "drizzle-orm"
import { z } from "zod"
import type { Db } from "@/db/client"
import { CURRENCIES, clients, invoices } from "@/db/schema"
import { vatIdField } from "@/lib/validation"

export type Client = typeof clients.$inferSelect

const emptyToNull = (v: unknown) => (v === "" ? null : v)

export const clientInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.union([z.literal(""), z.string().trim().email("Invalid email")]).default(""),
  addressLine1: z.string().trim().default(""),
  addressLine2: z.string().trim().default(""),
  postcode: z.string().trim().default(""),
  city: z.string().trim().default(""),
  country: z.string().trim().default(""),
  vatId: vatIdField,
  /** Leitweg-ID / purchase order reference — required on XRechnung e-invoices to public bodies. */
  buyerReference: z.string().trim().max(100).default(""),
  /** Overrides the workspace language and currency for this client's documents and emails. */
  language: z.preprocess(emptyToNull, z.enum(["de", "en"]).nullable()).default(null),
  currency: z.preprocess(emptyToNull, z.enum(CURRENCIES).nullable()).default(null),
})
export type ClientInput = z.infer<typeof clientInputSchema>

export function listClients(db: Db, orgId: string) {
  return db
    .select({ client: clients, invoiceCount: count(invoices.id) })
    .from(clients)
    .leftJoin(invoices, eq(invoices.clientId, clients.id))
    .where(eq(clients.orgId, orgId))
    .groupBy(clients.id)
    .orderBy(asc(clients.name))
    .all()
}

/** Callers validate first (`clientInputSchema`): the repo stores what it is given. */
export function createClient(db: Db, orgId: string, input: ClientInput): Client {
  return db
    .insert(clients)
    .values({ orgId, ...input })
    .returning()
    .get()
}

export function updateClient(db: Db, orgId: string, id: string, input: ClientInput) {
  db.update(clients)
    .set(input)
    .where(and(eq(clients.orgId, orgId), eq(clients.id, id)))
    .run()
}

export function deleteClient(db: Db, orgId: string, id: string): boolean {
  const used =
    db
      .select({ n: count() })
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.clientId, id)))
      .get()?.n ?? 0
  if (used) return false
  db.delete(clients)
    .where(and(eq(clients.orgId, orgId), eq(clients.id, id)))
    .run()
  return true
}
