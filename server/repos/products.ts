import { and, asc, desc, eq, sql } from "drizzle-orm"
import { z } from "zod"
import type { Db } from "@/db/client"
import { products } from "@/db/schema"
import { DomainError } from "@/lib/action-result"

export type Product = typeof products.$inferSelect

export const productInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(1000).default(""),
  unit: z.string().trim().max(30).default(""),
  unitPriceMinor: z.number().int().min(0).max(100_000_000_000),
  taxRateBp: z.number().int().min(0).max(10_000).nullable().default(null),
})
export type ProductInput = z.infer<typeof productInputSchema>

/** Most-used first — that is what the editor's autocomplete should offer. */
export function listProducts(db: Db, orgId: string, includeArchived = false): Product[] {
  return db
    .select()
    .from(products)
    .where(includeArchived ? eq(products.orgId, orgId) : and(eq(products.orgId, orgId), eq(products.archived, false)))
    .orderBy(desc(products.usageCount), asc(products.name))
    .all()
}

export function saveProduct(db: Db, orgId: string, id: string | null, input: ProductInput): Product {
  if (!id)
    return db
      .insert(products)
      .values({ orgId, ...input })
      .returning()
      .get()
  const updated = db
    .update(products)
    .set(input)
    .where(and(eq(products.orgId, orgId), eq(products.id, id)))
    .returning()
    .get()
  if (!updated) throw new DomainError("Product not found")
  return updated
}

export function archiveProduct(db: Db, orgId: string, id: string) {
  const result = db
    .update(products)
    .set({ archived: true })
    .where(and(eq(products.orgId, orgId), eq(products.id, id)))
    .run()
  if (!result.changes) throw new DomainError("Product not found")
}

export function bumpProductUsage(db: Db, orgId: string, id: string) {
  db.update(products)
    .set({ usageCount: sql`${products.usageCount} + 1` })
    .where(and(eq(products.orgId, orgId), eq(products.id, id)))
    .run()
}
