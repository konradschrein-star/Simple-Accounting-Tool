"use server"

import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { z } from "zod"
import { db } from "@/db/client"
import { user } from "@/db/schema"
import { PERSONAS } from "@/demo/personas"
import { seedDemoWorkspace } from "@/demo/seed"
import { getJurisdiction, JURISDICTION_CODES } from "@/jurisdictions"
import { getAuth } from "@/lib/auth"
import { todayIn } from "@/lib/dates"
import { env } from "@/lib/env"
import { getSession } from "@/server/context"
import { bootstrapWorkspace, setActiveOrganization } from "@/server/repos/workspace"

/** One click: guest session + a fully seeded sandbox workspace that expires automatically. */
export async function startDemo(jurisdiction: string) {
  if (!env().DEMO_ENABLED) redirect("/signin")
  const code = z.enum(JURISDICTION_CODES).catch("de").parse(jurisdiction)
  if (await getSession()) redirect("/dashboard")

  const { user: guest } = await getAuth().api.signInAnonymous({ headers: await headers() })
  const persona = PERSONAS[code]
  db.update(user).set({ name: persona.owner }).where(eq(user.id, guest.id)).run()
  const orgId = bootstrapWorkspace(db, guest.id, persona.business.name, {
    isDemo: true,
    demoExpiresAt: new Date(Date.now() + env().DEMO_TTL_HOURS * 3_600_000),
  })
  seedDemoWorkspace(db, orgId, guest.id, code, todayIn(getJurisdiction(code).timezone))
  const session = await getSession()
  if (session) setActiveOrganization(db, session.session.id, orgId)
  redirect("/dashboard")
}
