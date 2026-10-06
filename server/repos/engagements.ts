import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm"
import type { Db } from "@/db/client"
import { organization, serviceEngagements, user } from "@/db/schema"

export type Engagement = typeof serviceEngagements.$inferSelect

export function currentEngagement(db: Db, orgId: string): Engagement | null {
  return (
    db
      .select()
      .from(serviceEngagements)
      .where(and(eq(serviceEngagements.orgId, orgId), ne(serviceEngagements.status, "ended")))
      .orderBy(desc(serviceEngagements.createdAt))
      .get() ?? null
  )
}

/** Creates a consented engagement request unless one is already open. Returns the new id, or null. */
export function requestEngagement(db: Db, orgId: string): string | null {
  if (currentEngagement(db, orgId)) return null
  return db.insert(serviceEngagements).values({ orgId, status: "requested", clientConsentAt: new Date() }).returning({ id: serviceEngagements.id }).get().id
}

export function listEngagements(db: Db, opts: { staffUserId?: string; statuses?: Engagement["status"][] } = {}) {
  const conditions = [isNotNull(serviceEngagements.clientConsentAt)]
  if (opts.staffUserId) conditions.push(eq(serviceEngagements.assignedStaffUserId, opts.staffUserId))
  if (opts.statuses) conditions.push(inArray(serviceEngagements.status, opts.statuses))
  return db
    .select({ engagement: serviceEngagements, orgName: organization.name, staffName: user.name })
    .from(serviceEngagements)
    .innerJoin(organization, eq(organization.id, serviceEngagements.orgId))
    .leftJoin(user, eq(user.id, serviceEngagements.assignedStaffUserId))
    .where(and(...conditions))
    .orderBy(desc(serviceEngagements.createdAt))
    .all()
}

export function updateEngagement(db: Db, id: string, patch: Partial<Pick<Engagement, "status" | "assignedStaffUserId" | "planLabel" | "notes">>) {
  const extra = patch.status === "active" ? { startedAt: new Date() } : patch.status === "ended" ? { endedAt: new Date() } : {}
  db.update(serviceEngagements).set({ ...patch, ...extra }).where(eq(serviceEngagements.id, id)).run()
}
