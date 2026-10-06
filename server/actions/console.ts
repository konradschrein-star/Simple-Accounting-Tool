"use server"

import { redirect } from "next/navigation"
import { db } from "@/db/client"
import { requireStaff } from "@/server/context"
import { staffMayAccess } from "@/server/repos/engagements"
import { firstMembershipOrgId, setActiveOrganization } from "@/server/repos/workspace"

/** Staff enter a client's workspace (consented, active engagement required). */
export async function enterClientWorkspace(orgId: string) {
  const { user, session } = await requireStaff()
  if (!staffMayAccess(db, user, orgId)) throw new Error("No active, consented engagement for this client")
  setActiveOrganization(db, session.id, orgId)
  redirect("/dashboard")
}

export async function exitClientWorkspace() {
  const { user, session } = await requireStaff()
  setActiveOrganization(db, session.id, firstMembershipOrgId(db, user.id))
  redirect("/console")
}
