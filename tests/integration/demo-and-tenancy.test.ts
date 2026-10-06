import { beforeAll, describe, expect, it } from "vitest"
import type { Db } from "@/db/client"
import { seedDemoWorkspace } from "@/demo/seed"
import { JURISDICTION_CODES } from "@/jurisdictions"
import { activeAlerts } from "@/server/repos/advisory"
import { listCloses } from "@/server/repos/books"
import { createClient, listClients } from "@/server/repos/clients"
import { requestEngagement, staffMayAccess, updateEngagement } from "@/server/repos/engagements"
import { getInvoice, listDocuments } from "@/server/repos/invoices"
import { listTransactions, reviewQueue } from "@/server/repos/ledger"
import { bootstrapWorkspace } from "@/server/repos/workspace"
import { createUser, testDatabase } from "./helpers"

const TODAY = "2026-10-06"
let db: Db

beforeAll(() => {
  db = testDatabase()
})

describe.each(JURISDICTION_CODES)("demo workspace (%s)", (code) => {
  it("tells the full story: milestone, margin dip, review queue, closed month, invoices in every state", () => {
    const userId = createUser(db)
    const orgId = bootstrapWorkspace(db, userId, "Demo", { isDemo: true })
    seedDemoWorkspace(db, orgId, userId, code, TODAY)

    const alertTypes = activeAlerts(db, orgId).map((a) => a.type)
    expect(alertTypes).toContain("milestone_lifetime")
    expect(alertTypes).toContain("milestone_month")
    expect(alertTypes).toContain("margin_low")
    expect(reviewQueue(db, orgId)).toHaveLength(5)
    expect(listCloses(db, orgId).filter((c) => c.status === "closed")).toHaveLength(1)
    const statuses = new Set(listDocuments(db, orgId, "invoice").map((r) => r.invoice.status))
    expect([...statuses].sort()).toEqual(["cancelled", "draft", "finalized", "paid"])
    expect(listDocuments(db, orgId, "credit_note")).toHaveLength(1)
    expect(new Set(listDocuments(db, orgId, "quote").map((r) => r.invoice.status))).toEqual(new Set(["draft", "finalized", "accepted"]))
    expect(listDocuments(db, orgId, "invoice").some((r) => r.paidMinor > 0 && r.invoice.status === "finalized")).toBe(true)
  })
})

describe("tenant isolation", () => {
  it("one workspace cannot read another's data through the repos", () => {
    const alice = createUser(db)
    const bob = createUser(db)
    const orgA = bootstrapWorkspace(db, alice, "A")
    const orgB = bootstrapWorkspace(db, bob, "B")
    seedDemoWorkspace(db, orgA, alice, "de", TODAY)
    createClient(db, orgB, { name: "Only B", email: "", addressLine1: "", addressLine2: "", postcode: "", city: "", country: "", vatId: "" })

    const invoiceOfA = listDocuments(db, orgA, "invoice")[0].invoice.id
    expect(getInvoice(db, orgB, invoiceOfA)).toBeNull()
    expect(listDocuments(db, orgB, "invoice")).toHaveLength(0)
    expect(listTransactions(db, orgB, {})).toHaveLength(0)
    expect(listClients(db, orgA).map((c) => c.client.name)).not.toContain("Only B")
  })

  it("staff need an active, consented engagement and an assignment", () => {
    const owner = createUser(db)
    const staff = createUser(db, { role: "staff" })
    const other = createUser(db, { role: "staff" })
    const orgId = bootstrapWorkspace(db, owner, "Client")
    const staffUser = { id: staff, role: "staff" }
    const otherUser = { id: other, role: "staff" }
    expect(staffMayAccess(db, staffUser, orgId)).toBe(false)
    expect(staffMayAccess(db, { id: owner, role: "user" }, orgId)).toBe(false)
    const engagement = requestEngagement(db, orgId)!
    expect(staffMayAccess(db, staffUser, orgId)).toBe(false) // requested, not active
    updateEngagement(db, engagement, { status: "active", assignedStaffUserId: staff })
    expect(staffMayAccess(db, staffUser, orgId)).toBe(true)
    expect(staffMayAccess(db, otherUser, orgId)).toBe(false)
    expect(staffMayAccess(db, { id: other, role: "admin" }, orgId)).toBe(true) // admins see every active engagement
  })
})

describe("demo cleanup", () => {
  it("deletes only expired demo workspaces and orphaned guests", async () => {
    const { cleanupExpiredDemos } = await import("@/demo/cleanup")
    const { getSettings } = await import("@/server/repos/workspace")
    const guest = createUser(db, { isAnonymous: true })
    const real = createUser(db)
    const demoOrg = bootstrapWorkspace(db, guest, "Demo", { isDemo: true, demoExpiresAt: new Date(Date.now() - 1000) })
    const freshDemo = bootstrapWorkspace(db, createUser(db, { isAnonymous: true }), "Fresh", { isDemo: true, demoExpiresAt: new Date(Date.now() + 3_600_000) })
    const realOrg = bootstrapWorkspace(db, real, "Real")
    expect(cleanupExpiredDemos(db, "./data-test")).toBeGreaterThanOrEqual(1)
    expect(() => getSettings(db, demoOrg)).toThrow()
    expect(getSettings(db, freshDemo).isDemo).toBe(true)
    expect(getSettings(db, realOrg).isDemo).toBe(false)
  })
})
