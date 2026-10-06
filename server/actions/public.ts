"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/db/client"
import { guarded, type ActionResult } from "@/lib/action-result"
import { clientIp } from "@/lib/client-ip"
import { todayIn } from "@/lib/dates"
import { limits } from "@/lib/rate-limit"
import { findByPublicToken, setQuoteOutcome } from "@/server/repos/invoices"
import { getSettings } from "@/server/repos/workspace"

/** A client answering a quote from its share link — while it is still valid. The 32-character token is the only credential. */
export async function respondToQuote(token: string, outcome: "accepted" | "declined"): Promise<ActionResult> {
  const found = findByPublicToken(db, token)
  if (!found) return { ok: false, error: "This link is no longer valid." }
  if (!limits.publicLink(await clientIp())) return { ok: false, error: "Too many attempts — please try again later." }
  const { orgId, id } = found.invoice
  return guarded(() => {
    setQuoteOutcome(db, orgId, id, z.enum(["accepted", "declined"]).parse(outcome), "client", todayIn(getSettings(db, orgId).timezone))
    revalidatePath(`/i/${token}`)
    return { message: outcome === "accepted" ? "Thank you — the quote is accepted." : "Thanks for letting us know." }
  })
}
