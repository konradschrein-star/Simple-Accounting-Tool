"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/db/client"
import { guarded, type ActionResult } from "@/lib/action-result"
import { audit, requireReadyOrg } from "@/server/context"
import { archiveProduct, productInputSchema, saveProduct, type Product } from "@/server/repos/products"

export async function saveProductAction(id: string | null, input: unknown): Promise<ActionResult<{ product?: Product }>> {
  const ctx = await requireReadyOrg()
  const parsed = productInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid product" }
  const result = await guarded(() => {
    const product = saveProduct(db, ctx.orgId, id, parsed.data)
    audit(ctx, id ? "product.updated" : "product.created", "product", product.id)
    return { product, message: id ? "Product updated" : "Product added" }
  })
  if (result.ok) revalidatePath("/products")
  return result
}

export async function archiveProductAction(id: string): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  const result = await guarded(() => {
    archiveProduct(db, ctx.orgId, id)
    audit(ctx, "product.archived", "product", id)
    return { message: "Product archived" }
  })
  if (result.ok) revalidatePath("/products")
  return result
}
