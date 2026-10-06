"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { z } from "zod"
import { db } from "@/db/client"
import { PERSONAS } from "@/demo/personas"
import { seedDemoWorkspace } from "@/demo/seed"
import { getJurisdiction, JURISDICTION_CODES } from "@/jurisdictions"
import { getAuth } from "@/lib/auth"
import { todayIn } from "@/lib/dates"
import { env } from "@/lib/env"
import { limits } from "@/lib/rate-limit"
import { getSession } from "@/server/context"
import { activeDemoCount, bootstrapWorkspace, renameUser, setActiveOrganization } from "@/server/repos/workspace"

const MAX_ACTIVE_DEMOS = 200

/** One click: guest session + a fully seeded sandbox workspace that expires automatically. */
export async function startDemo(jurisdiction: string) {
  if (!env().DEMO_ENABLED) redirect("/signin")
  const code = z.enum(JURISDICTION_CODES).catch("de").parse(jurisdiction)
  if (await getSession()) redirect("/dashboard")
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local"
  if (!limits.demo(ip) || activeDemoCount(db) >= MAX_ACTIVE_DEMOS) redirect("/?demo=busy")

  const { user: guest } = await getAuth().api.signInAnonymous({ headers: await headers() })
  const persona = PERSONAS[code]
  renameUser(db, guest.id, persona.owner)
  const orgId = bootstrapWorkspace(db, guest.id, persona.business.name, {
    isDemo: true,
    demoExpiresAt: new Date(Date.now() + env().DEMO_TTL_HOURS * 3_600_000),
  })
  seedDemoWorkspace(db, orgId, guest.id, code, todayIn(getJurisdiction(code).timezone))
  const session = await getSession()
  if (session) setActiveOrganization(db, session.session.id, orgId)
  redirect("/dashboard")
}
