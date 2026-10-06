import fs from "node:fs"
import path from "node:path"
import { and, eq, lt, notExists } from "drizzle-orm"
import type { Db } from "@/db/client"
import { member, organization, user, workspaceSettings } from "@/db/schema"

/** Deletes expired demo workspaces (with their files) and guest users that no longer own anything. */
export function cleanupExpiredDemos(db: Db, dataDir: string, now = new Date()): number {
  const expired = db
    .select({ orgId: workspaceSettings.orgId })
    .from(workspaceSettings)
    .where(and(eq(workspaceSettings.isDemo, true), lt(workspaceSettings.demoExpiresAt, now)))
    .all()
    .map((r) => r.orgId)
  for (const orgId of expired) {
    for (const dir of ["uploads", "pdfs"]) fs.rmSync(path.join(dataDir, dir, orgId), { recursive: true, force: true })
    db.delete(organization).where(eq(organization.id, orgId)).run()
  }
  db.delete(user)
    .where(and(eq(user.isAnonymous, true), notExists(db.select({ id: member.id }).from(member).where(eq(member.userId, user.id)))))
    .run()
  return expired.length
}
