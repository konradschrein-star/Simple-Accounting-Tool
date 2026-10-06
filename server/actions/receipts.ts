"use server"

import fs from "node:fs"
import { revalidatePath } from "next/cache"
import { db } from "@/db/client"
import { guarded, type ActionResult } from "@/lib/action-result"
import { dataPath } from "@/lib/data-path"
import { formatRate } from "@/lib/money"
import { audit, requireReadyOrg } from "@/server/context"
import { deleteReceipt, matchReceipt, unmatchReceipt } from "@/server/repos/receipts"

function refresh() {
  revalidatePath("/receipts")
  revalidatePath("/transactions")
  revalidatePath("/books")
}

export async function linkReceipt(id: string, transactionId: string): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  return guarded(() => {
    const { vatRateBp } = matchReceipt(db, ctx.orgId, id, transactionId, ctx.jurisdiction.taxRatesBp)
    audit(ctx, "receipt.matched", "receipt", id, { transactionId, vatRateBp })
    refresh()
    return { message: vatRateBp === null ? "Receipt attached" : `Receipt attached · ${ctx.jurisdiction.taxLabel} ${formatRate(vatRateBp, ctx.settings.locale)} recorded` }
  })
}

export async function unlinkReceipt(id: string): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  return guarded(() => {
    unmatchReceipt(db, ctx.orgId, id)
    audit(ctx, "receipt.unmatched", "receipt", id)
    refresh()
  })
}

export async function removeReceipt(id: string): Promise<ActionResult> {
  const ctx = await requireReadyOrg()
  return guarded(() => {
    const receipt = deleteReceipt(db, ctx.orgId, id)
    if (receipt) fs.rmSync(dataPath(receipt.filePath), { force: true })
    audit(ctx, "receipt.deleted", "receipt", id)
    refresh()
    return { message: "Receipt deleted" }
  })
}
