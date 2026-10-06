"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/db/client"
import { requireAdmin } from "@/server/context"
import { listUsers, setRequestStatus, setUserRole } from "@/server/repos/admin"
import { updateEngagement } from "@/server/repos/engagements"

export async function updateRequestStatus(id: string, status: string) {
  await requireAdmin()
  setRequestStatus(db, id, z.enum(["new", "contacted", "booked", "closed"]).parse(status))
  revalidatePath("/admin")
}

export async function setEngagementStatus(id: string, status: string) {
  await requireAdmin()
  updateEngagement(db, id, { status: z.enum(["requested", "active", "paused", "ended"]).parse(status) })
  revalidatePath("/admin")
  revalidatePath("/console")
}

export async function assignEngagementStaff(id: string, staffUserId: string) {
  await requireAdmin()
  const assignee = listUsers(db).find((u) => u.id === staffUserId)
  if (assignee?.role !== "staff" && assignee?.role !== "admin") throw new Error("Only team members can be assigned")
  updateEngagement(db, id, { assignedStaffUserId: staffUserId })
  revalidatePath("/admin")
  revalidatePath("/console")
}

export async function updateUserRole(userId: string, role: string) {
  const { user } = await requireAdmin()
  if (userId === user.id) throw new Error("You cannot change your own role")
  setUserRole(db, userId, z.enum(["user", "staff", "admin"]).parse(role))
  revalidatePath("/admin")
}
