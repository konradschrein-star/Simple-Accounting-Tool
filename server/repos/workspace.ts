import { and, asc, count, eq, gt, isNotNull } from "drizzle-orm"
import { nanoid } from "nanoid"
import type { Db } from "@/db/client"
import { ledgerAccounts, member, organization, serviceEngagements, session, user, workspaceSettings } from "@/db/schema"
import { getJurisdiction, type JurisdictionCode, type TaxProfile } from "@/jurisdictions"

export type WorkspaceSettings = typeof workspaceSettings.$inferSelect

export function firstMembershipOrgId(db: Db, userId: string): string | null {
  return (
    db
      .select({ orgId: member.organizationId })
      .from(member)
      .where(eq(member.userId, userId))
      .orderBy(asc(member.createdAt))
      .get()?.orgId ?? null
  )
}

export function isMember(db: Db, userId: string, orgId: string): boolean {
  return !!db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, orgId)))
    .get()
}

/** Staff may act inside a client workspace only with an active, consented engagement (and assignment unless admin). */
export function staffMayAccess(db: Db, staffUserId: string, isAdmin: boolean, orgId: string): boolean {
  const engagement = db
    .select()
    .from(serviceEngagements)
    .where(and(eq(serviceEngagements.orgId, orgId), eq(serviceEngagements.status, "active"), isNotNull(serviceEngagements.clientConsentAt)))
    .get()
  return !!engagement && (isAdmin || engagement.assignedStaffUserId === staffUserId)
}

/** Creates an empty workspace (org + owner membership + settings) in one synchronous transaction. */
export function bootstrapWorkspace(db: Db, userId: string, name: string, opts: { isDemo?: boolean; demoExpiresAt?: Date } = {}): string {
  const orgId = nanoid()
  db.transaction((tx) => {
    tx.insert(organization).values({ id: orgId, name, slug: `ws-${orgId.toLowerCase()}`, createdAt: new Date() }).run()
    tx.insert(member).values({ id: nanoid(), organizationId: orgId, userId, role: "owner", createdAt: new Date() }).run()
    tx.insert(workspaceSettings)
      .values({ orgId, isDemo: opts.isDemo ?? false, demoExpiresAt: opts.demoExpiresAt ?? null })
      .run()
  })
  return orgId
}

export function setActiveOrganization(db: Db, sessionId: string, orgId: string | null) {
  db.update(session).set({ activeOrganizationId: orgId }).where(eq(session.id, sessionId)).run()
}

export function getSettings(db: Db, orgId: string): WorkspaceSettings {
  const settings = db.select().from(workspaceSettings).where(eq(workspaceSettings.orgId, orgId)).get()
  if (!settings) throw new Error(`workspace_settings missing for ${orgId}`)
  return settings
}

export function getOrganizationName(db: Db, orgId: string): string {
  return db.select({ name: organization.name }).from(organization).where(eq(organization.id, orgId)).get()?.name ?? ""
}

export function taxProfileOf(settings: WorkspaceSettings): TaxProfile {
  return {
    taxRegistered: settings.taxRegistered,
    smallBusinessExempt: settings.smallBusinessExempt,
    vatFilingFrequency: settings.vatFilingFrequency,
    vatPeriodEndMonth: Math.min(3, Math.max(1, settings.vatPeriodEndMonth)) as 1 | 2 | 3,
    deDauerfrist: settings.deDauerfrist,
  }
}

/** Applies a jurisdiction's defaults and seeds its chart of accounts (idempotent per account code). */
export function applyJurisdiction(db: Db, orgId: string, code: JurisdictionCode) {
  const j = getJurisdiction(code)
  db.transaction((tx) => {
    tx.update(workspaceSettings)
      .set({
        jurisdiction: code,
        currency: j.currency,
        locale: j.locale,
        timezone: j.timezone,
        defaultTaxRateBp: j.defaultTaxRateBp,
        country: j.name,
      })
      .where(eq(workspaceSettings.orgId, orgId))
      .run()
    tx.insert(ledgerAccounts)
      .values(j.chartOfAccounts.map((a) => ({ orgId, code: a.code, name: a.name, kind: a.kind, taxLine: a.taxLine })))
      .onConflictDoNothing()
      .run()
  })
}

export function updateSettings(db: Db, orgId: string, patch: Partial<Omit<WorkspaceSettings, "orgId" | "createdAt">>) {
  db.update(workspaceSettings).set(patch).where(eq(workspaceSettings.orgId, orgId)).run()
}

export function renameOrganization(db: Db, orgId: string, name: string) {
  db.update(organization).set({ name }).where(eq(organization.id, orgId)).run()
}

export function activeDemoCount(db: Db): number {
  return db.select({ n: count() }).from(workspaceSettings).where(and(eq(workspaceSettings.isDemo, true), gt(workspaceSettings.demoExpiresAt, new Date()))).get()?.n ?? 0
}

export function renameUser(db: Db, userId: string, name: string) {
  db.update(user).set({ name }).where(eq(user.id, userId)).run()
}

/** Workspaces that finished onboarding (the hourly alert sweep runs over these). */
export function onboardedWorkspaceIds(db: Db): string[] {
  return db.select({ orgId: workspaceSettings.orgId }).from(workspaceSettings).where(isNotNull(workspaceSettings.jurisdiction)).all().map((r) => r.orgId)
}
