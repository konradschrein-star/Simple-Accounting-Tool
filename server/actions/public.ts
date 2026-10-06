"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/db/client"
import type { ActionResult } from "@/lib/action-result"
import { guarded } from "@/lib/action-result"
import { limits } from "@/lib/rate-limit"
import { findByPublicToken, setQuoteOutcome } from "@/server/repos/invoices"

/** A client answering a quote from its public link. The 32-character token is the only credential. */
export async function respondToQuote(token: string, outcome: "accepted" | "declined"): Promise<ActionResult> {
  if (!limits.publicLink(token)) return { ok: false, error: "Too many attempts — please try again later." }
  const found = findByPublicToken(db, token)
  if (!found || found.invoice.kind !== "quote" || found.invoice.status !== "finalized") return { ok: false, error: "This quote can no longer be answered." }
  return guarded(() => {
    setQuoteOutcome(db, found.invoice.orgId, found.invoice.id, z.enum(["accepted", "declined"]).parse(outcome))
    revalidatePath(`/i/${token}`)
    return { message: outcome === "accepted" ? "Thank you — the quote is accepted." : "Thanks for letting us know." }
  })
}
