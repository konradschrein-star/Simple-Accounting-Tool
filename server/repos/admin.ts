import { and, asc, count, desc, eq, inArray, max, sql } from "drizzle-orm"
import type { Db } from "@/db/client"
import { advisoryAlerts, advisoryRequests, importBatches, member, organization, periodCloses, transactions, user, workspaceSettings } from "@/db/schema"
import { workspaceMetrics } from "@/advisory/evaluate"
import { todayIn } from "@/lib/dates"

export type LeadRow = {
  orgId: string
  orgName: string
  ownerName: string
  ownerEmail: string
  jurisdiction: string | null
  currency: string
  optedIn: boolean
  isDemo: boolean
  createdAt: Date
  lifetimeInvoicedMinor: number
  trailing12CashInMinor: number
  trailing12ExpensesMinor: number
  trailing12MarginBp: number | null
  activeAlerts: number
  request: { id: string; kind: string; status: string; createdAt: Date } | null
}

function owners(db: Db, orgIds: string[]) {
  if (!orgIds.length) return new Map<string, { name: string; email: string }>()
  return new Map(
    db
      .select({ orgId: member.organizationId, name: user.name, email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(inArray(member.organizationId, orgIds), eq(member.role, "owner")))
      .all()
      .map((r) => [r.orgId, { name: r.name, email: r.email }])
  )
}

/** Opted-in workspaces or ones that asked for help — the qualified lead list. Non-opted-in workspaces only appear in aggregates. */
export function leadRows(db: Db): LeadRow[] {
  const requests = db.select().from(advisoryRequests).orderBy(desc(advisoryRequests.createdAt)).all()
  const latestRequest = new Map<string, (typeof requests)[number]>()
  for (const r of requests) if (!latestRequest.has(r.orgId)) latestRequest.set(r.orgId, r)
  const workspaces = db
    .select({ orgId: workspaceSettings.orgId, name: organization.name, settings: workspaceSettings })
    .from(workspaceSettings)
    .innerJoin(organization, eq(organization.id, workspaceSettings.orgId))
    .all()
    .filter((w) => w.settings.jurisdiction && (w.settings.advisoryOptIn || latestRequest.has(w.orgId)))
  const ownerMap = owners(
    db,
    workspaces.map((w) => w.orgId)
  )
  const alertCounts = new Map(
    db
      .select({ orgId: advisoryAlerts.orgId, n: count() })
      .from(advisoryAlerts)
      .where(eq(advisoryAlerts.status, "active"))
      .groupBy(advisoryAlerts.orgId)
      .all()
      .map((r) => [r.orgId, r.n])
  )
  return workspaces
    .map((w) => {
      const m = workspaceMetrics(db, w.orgId, todayIn(w.settings.timezone))
      const req = latestRequest.get(w.orgId)
      const owner = ownerMap.get(w.orgId)
      return {
        orgId: w.orgId,
        orgName: w.name,
        ownerName: owner?.name ?? "",
        ownerEmail: owner?.email ?? "",
        jurisdiction: w.settings.jurisdiction,
        currency: w.settings.currency,
        optedIn: w.settings.advisoryOptIn,
        isDemo: w.settings.isDemo,
        createdAt: w.settings.createdAt,
        lifetimeInvoicedMinor: m.lifetime.invoicedMinor,
        trailing12CashInMinor: m.trailing12.cashInMinor,
        trailing12ExpensesMinor: m.trailing12.expensesMinor,
        trailing12MarginBp: m.trailing12.marginBp,
        activeAlerts: alertCounts.get(w.orgId) ?? 0,
        request: req ? { id: req.id, kind: req.kind, status: req.status, createdAt: req.createdAt } : null,
      }
    })
    .sort(
      (a, b) =>
        Number(b.request?.status === "new") - Number(a.request?.status === "new") ||
        (b.request?.createdAt.getTime() ?? 0) - (a.request?.createdAt.getTime() ?? 0) ||
        b.createdAt.getTime() - a.createdAt.getTime()
    )
}

export function platformTotals(db: Db) {
  const all = db.select({ optIn: workspaceSettings.advisoryOptIn, demo: workspaceSettings.isDemo }).from(workspaceSettings).all()
  return {
    workspaces: all.filter((w) => !w.demo).length,
    demos: all.filter((w) => w.demo).length,
    optedIn: all.filter((w) => w.optIn && !w.demo).length,
    requests: db.select({ n: count() }).from(advisoryRequests).get()?.n ?? 0,
  }
}

export function setRequestStatus(db: Db, id: string, status: "new" | "contacted" | "booked" | "closed") {
  db.update(advisoryRequests).set({ status }).where(eq(advisoryRequests.id, id)).run()
}

export function listUsers(db: Db) {
  return db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role, isAnonymous: user.isAnonymous, createdAt: user.createdAt })
    .from(user)
    .orderBy(asc(user.createdAt))
    .all()
}

export function setUserRole(db: Db, userId: string, role: "user" | "staff" | "admin") {
  db.update(user).set({ role }).where(eq(user.id, userId)).run()
}

/** Work signals per client for the bookkeeper console. */
export function consoleSignals(db: Db, orgIds: string[], currentMonth: string, lastMonth: string) {
  if (!orgIds.length)
    return new Map<string, { needsReview: number; lastImport: Date | null; failedRecon: number; lastClose: string | null; lastMonthClosed: boolean }>()
  const needsReview = new Map(
    db
      .select({ orgId: transactions.orgId, n: count() })
      .from(transactions)
      .where(and(inArray(transactions.orgId, orgIds), eq(transactions.reviewStatus, "needs_review")))
      .groupBy(transactions.orgId)
      .all()
      .map((r) => [r.orgId, r.n])
  )
  const imports = new Map(
    db
      .select({
        orgId: importBatches.orgId,
        last: max(importBatches.createdAt),
        failed: sql<number>`sum(case when json_extract(${importBatches.reconciliation}, '$.ok') = 0 then 1 else 0 end)`,
      })
      .from(importBatches)
      .where(inArray(importBatches.orgId, orgIds))
      .groupBy(importBatches.orgId)
      .all()
      .map((r) => [r.orgId, r])
  )
  const closes = db
    .select({ orgId: periodCloses.orgId, period: periodCloses.period })
    .from(periodCloses)
    .where(and(inArray(periodCloses.orgId, orgIds), eq(periodCloses.status, "closed")))
    .orderBy(desc(periodCloses.period))
    .all()
  return new Map(
    orgIds.map((id) => {
      const orgCloses = closes.filter((c) => c.orgId === id).map((c) => c.period)
      const imp = imports.get(id)
      return [
        id,
        {
          needsReview: needsReview.get(id) ?? 0,
          lastImport: imp?.last ?? null,
          failedRecon: Number(imp?.failed ?? 0),
          lastClose: orgCloses[0] ?? null,
          lastMonthClosed: orgCloses.includes(lastMonth) || orgCloses.includes(currentMonth),
        },
      ]
    })
  )
}
