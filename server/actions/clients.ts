"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/db/client"
import { audit, requireReadyOrg } from "@/server/context"
import { clientInputSchema, createClient, deleteClient, updateClient, type Client } from "@/server/repos/clients"

export type ClientActionResult = { ok: true; client?: Client } | { ok: false; error: string }

export async function saveClient(id: string | null, input: unknown): Promise<ClientActionResult> {
  const ctx = await requireReadyOrg()
  const parsed = clientInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid client" }
  if (id) {
    updateClient(db, ctx.orgId, id, parsed.data)
    audit(ctx, "client.updated", "client", id)
    revalidatePath("/clients")
    return { ok: true }
  }
  const client = createClient(db, ctx.orgId, parsed.data)
  audit(ctx, "client.created", "client", client.id)
  revalidatePath("/clients")
  return { ok: true, client }
}

export async function removeClient(id: string): Promise<ClientActionResult> {
  const ctx = await requireReadyOrg()
  if (!deleteClient(db, ctx.orgId, id)) return { ok: false, error: "This client has invoices and cannot be deleted." }
  audit(ctx, "client.deleted", "client", id)
  revalidatePath("/clients")
  return { ok: true }
}
