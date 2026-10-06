import { db } from "@/db/client"
import { requireReadyOrg } from "@/server/context"
import { exportWorkspace } from "@/server/repos/export"

/** GDPR data export: every row this workspace owns, as one JSON document. */
export async function GET() {
  const { orgId, orgName, settings, today } = await requireReadyOrg()
  const data = { exportedAt: new Date().toISOString(), workspace: { id: orgId, name: orgName, settings }, ...exportWorkspace(db, orgId) }
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="workspace-export-${today}.json"` },
  })
}
