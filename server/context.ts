import "server-only"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"
import { db } from "@/db/client"
import { auditLog } from "@/db/schema"
import { getJurisdiction, type Jurisdiction } from "@/jurisdictions"
import { getAuth } from "@/lib/auth"
import { todayIn } from "@/lib/dates"
import {
  bootstrapWorkspace,
  firstMembershipOrgId,
  getOrganizationName,
  getSettings,
  isMember,
  setActiveOrganization,
  type WorkspaceSettings,
} from "./repos/workspace"
import { staffMayAccess } from "./repos/engagements"

export type SessionUser = {
  id: string
  name: string
  email: string
  image?: string | null
  role?: string | null
  isAnonymous?: boolean | null
}

export type OrgContext = {
  user: SessionUser
  sessionId: string
  orgId: string
  orgName: string
  actor: "owner" | "staff"
  settings: WorkspaceSettings
  /** Null until onboarding has picked a jurisdiction. */
  jurisdiction: Jurisdiction | null
  today: string
}

export type ReadyOrgContext = OrgContext & { jurisdiction: Jurisdiction }

export const getSession = cache(async () => getAuth().api.getSession({ headers: await headers() }))

export async function requireUser() {
  const s = await getSession()
  if (!s) redirect("/signin")
  return s
}

export const isStaffRole = (role?: string | null) => role === "admin" || role === "staff"

/**
 * The single tenancy choke point. Resolves the active workspace for this request, verifying membership
 * (or a consented bookkeeping engagement for staff), bootstrapping a first workspace when the user has none.
 */
export const requireOrg = cache(async (): Promise<OrgContext> => {
  const { session, user } = await requireUser()
  let orgId = session.activeOrganizationId ?? null
  let actor: OrgContext["actor"] = "owner"

  if (orgId && !isMember(db, user.id, orgId)) {
    if (staffMayAccess(db, user, orgId)) actor = "staff"
    else orgId = null
  }
  if (!orgId) {
    const existing = firstMembershipOrgId(db, user.id)
    // Guests never get a permanent workspace — their only workspace is the expiring demo.
    if (!existing && user.isAnonymous) redirect("/")
    orgId = existing ?? bootstrapWorkspace(db, user.id, user.name ? `${user.name}'s business` : "My business")
    setActiveOrganization(db, session.id, orgId)
  }

  const settings = getSettings(db, orgId)
  return {
    user,
    sessionId: session.id,
    orgId,
    orgName: getOrganizationName(db, orgId),
    actor,
    settings,
    jurisdiction: settings.jurisdiction ? getJurisdiction(settings.jurisdiction) : null,
    today: todayIn(settings.timezone),
  }
})

/** For tenant screens: guarantees onboarding is complete. */
export async function requireReadyOrg(): Promise<ReadyOrgContext> {
  const ctx = await requireOrg()
  if (!ctx.jurisdiction) redirect("/onboarding")
  return ctx as ReadyOrgContext
}

export async function requireStaff() {
  const s = await requireUser()
  if (!isStaffRole(s.user.role)) redirect("/dashboard")
  return s
}

export async function requireAdmin() {
  const s = await requireUser()
  if (s.user.role !== "admin") redirect("/dashboard")
  return s
}

/** Records a mutation. Every staff write and every period close/reopen must be audited. */
export function audit(ctx: Pick<OrgContext, "orgId" | "user" | "actor">, action: string, entity: string, entityId?: string | null, diff?: unknown) {
  db.insert(auditLog)
    .values({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.actor, action, entity, entityId: entityId ?? null, diff: diff ?? null })
    .run()
}
