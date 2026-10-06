"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { workspaceMetrics } from "@/advisory/evaluate"
import { db } from "@/db/client"
import { env } from "@/lib/env"
import { notifyLead } from "@/lib/lead-webhook"
import { limits } from "@/lib/rate-limit"
import { audit, requireReadyOrg, type ReadyOrgContext } from "@/server/context"
import { createAdvisoryRequest, getAlert, hasOpenRequest, setAlertStatus } from "@/server/repos/advisory"
import { requestEngagement } from "@/server/repos/engagements"

export type CtaResult = { ok: true; bookingUrl: string | null; alreadyRequested?: boolean } | { ok: false; error: string }

function snapshot(ctx: ReadyOrgContext) {
  const m = workspaceMetrics(db, ctx.orgId, ctx.today)
  return {
    jurisdiction: ctx.jurisdiction.code,
    currency: ctx.settings.currency,
    thisMonth: m.thisMonth,
    trailing12: m.trailing12,
    trailing90: m.trailing90,
    lifetime: m.lifetime,
    outstandingMinor: m.outstandingMinor,
    overdueMinor: m.overdueMinor,
    uncategorizedCount: m.uncategorizedCount,
  }
}

function bookingUrl(ctx: ReadyOrgContext): string | null {
  const base = env().BOOKING_URL
  if (!base) return null
  const url = new URL(base)
  url.searchParams.set("name", ctx.user.name)
  url.searchParams.set("email", ctx.user.email)
  return url.toString()
}

export async function requestGrowthPlan(alertId: string | null, message = ""): Promise<CtaResult> {
  const ctx = await requireReadyOrg()
  if (!limits.cta(ctx.user.id)) return { ok: false, error: "You've already sent a request — we'll be in touch shortly." }
  if (hasOpenRequest(db, ctx.orgId, "growth_plan")) return { ok: true, bookingUrl: bookingUrl(ctx), alreadyRequested: true }
  const metrics = snapshot(ctx)
  const ownAlertId = alertId && getAlert(db, ctx.orgId, alertId) ? alertId : null
  const request = createAdvisoryRequest(db, {
    orgId: ctx.orgId,
    userId: ctx.user.id,
    kind: "growth_plan",
    alertId: ownAlertId,
    metricsSnapshot: metrics,
    message: z.string().max(2000).catch("").parse(message),
  })
  if (ownAlertId) setAlertStatus(db, ctx.orgId, ownAlertId, "converted")
  audit(ctx, "advisory.requested", "advisory_request", request.id)
  if (!ctx.settings.isDemo) notifyLead({ type: "growth_plan", workspace: ctx.orgName, name: ctx.user.name, email: ctx.user.email, metrics })
  revalidatePath("/dashboard")
  return { ok: true, bookingUrl: bookingUrl(ctx) }
}

/** Done-for-you bookkeeping. Explicit consent is required because staff will access the workspace. */
export async function requestBookkeeping(consent: boolean): Promise<CtaResult> {
  const ctx = await requireReadyOrg()
  if (!consent) return { ok: false, error: "Please confirm that our bookkeepers may access your workspace." }
  if (!limits.cta(ctx.user.id)) return { ok: false, error: "You've already sent a request — we'll be in touch shortly." }
  const created = requestEngagement(db, ctx.orgId)
  if (!created) return { ok: true, bookingUrl: bookingUrl(ctx), alreadyRequested: true }
  const metrics = snapshot(ctx)
  const request = createAdvisoryRequest(db, { orgId: ctx.orgId, userId: ctx.user.id, kind: "bookkeeping", metricsSnapshot: metrics })
  audit(ctx, "bookkeeping.requested", "service_engagement", created, { consent: true })
  if (!ctx.settings.isDemo) notifyLead({ type: "bookkeeping", workspace: ctx.orgName, name: ctx.user.name, email: ctx.user.email, requestId: request.id, metrics })
  revalidatePath("/", "layout")
  return { ok: true, bookingUrl: bookingUrl(ctx) }
}

export async function dismissAlert(alertId: string) {
  const ctx = await requireReadyOrg()
  setAlertStatus(db, ctx.orgId, alertId, "dismissed")
  revalidatePath("/dashboard")
}
