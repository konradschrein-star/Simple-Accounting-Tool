"use server"

import fs from "node:fs"
import path from "node:path"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { db } from "@/db/client"
import { organization, user } from "@/db/schema"
import { env } from "@/lib/env"
import { audit, requireReadyOrg } from "@/server/context"
import { renameOrganization, updateSettings } from "@/server/repos/workspace"
import { eq } from "drizzle-orm"

const text = z.string().trim().max(200).default("")
const checkbox = z.preprocess((v) => v === "on" || v === "true", z.boolean())

const profileSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  legalName: text,
  addressLine1: text,
  addressLine2: text,
  postcode: text,
  city: text,
  country: text,
  email: text,
  phone: text,
  website: text,
  taxNumber: text,
  vatId: text,
  bankIban: text,
  bankBic: text,
  ukSortCode: text,
  ukAccountNumber: text,
  usRoutingNumber: text,
  invoicePrefix: z.string().trim().min(1).max(12).regex(/^[A-Za-z0-9-_/]+$/, "Prefix may only contain letters, digits, - _ /"),
  defaultPaymentTermsDays: z.coerce.number().int().min(0).max(365),
  taxRegistered: checkbox,
  smallBusinessExempt: checkbox,
  vatFilingFrequency: z.enum(["monthly", "quarterly", "none"]),
  vatPeriodEndMonth: z.coerce.number().int().min(1).max(3),
  deDauerfrist: checkbox,
  advisoryOptIn: checkbox,
})

export type SettingsState = { ok?: boolean; error?: string }

export async function saveSettings(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const ctx = await requireReadyOrg()
  const parsed = profileSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form" }
  const { businessName, advisoryOptIn, ...settings } = parsed.data
  const exempt = ctx.jurisdiction.code === "de" && settings.smallBusinessExempt
  renameOrganization(db, ctx.orgId, businessName)
  updateSettings(db, ctx.orgId, {
    ...settings,
    smallBusinessExempt: exempt,
    taxRegistered: settings.taxRegistered && !exempt,
    defaultTaxRateBp: exempt || !settings.taxRegistered ? 0 : ctx.jurisdiction.defaultTaxRateBp,
    advisoryOptIn,
    advisoryOptInAt: advisoryOptIn && !ctx.settings.advisoryOptIn ? new Date() : advisoryOptIn ? ctx.settings.advisoryOptInAt : null,
  })
  audit(ctx, "settings.updated", "workspace", ctx.orgId)
  revalidatePath("/", "layout")
  return { ok: true }
}

export async function removeLogo() {
  const ctx = await requireReadyOrg()
  if (ctx.settings.logoPath) fs.rmSync(path.join(path.resolve(env().DATA_DIR), ctx.settings.logoPath), { force: true })
  updateSettings(db, ctx.orgId, { logoPath: null })
  revalidatePath("/settings")
}

/** GDPR erasure: deletes the workspace (cascade) and its files, then the user account (sessions cascade). */
export async function deleteWorkspace() {
  const ctx = await requireReadyOrg()
  if (ctx.actor !== "owner") throw new Error("Only the owner can delete a workspace")
  const dataDir = path.resolve(env().DATA_DIR)
  for (const dir of ["uploads", "pdfs"]) fs.rmSync(path.join(dataDir, dir, ctx.orgId), { recursive: true, force: true })
  db.delete(organization).where(eq(organization.id, ctx.orgId)).run()
  if (ctx.user.role !== "admin") db.delete(user).where(eq(user.id, ctx.user.id)).run()
  redirect("/")
}
