"use server"

import fs from "node:fs"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { db } from "@/db/client"
import { evaluateTriggers } from "@/advisory/evaluate"
import { normalizeTaxProfile } from "@/jurisdictions/tax-profile"
import { dataPath } from "@/lib/data-path"
import { checkbox, text as textField } from "@/lib/form"
import { parseAmountInput } from "@/lib/money"
import { bicProblem, ibanProblem, routingNumberProblem, sortCodeProblem, accountNumberProblem, vatIdProblem } from "@/lib/validation"
import { audit, requireReadyOrg } from "@/server/context"
import { eraseWorkspace, renameOrganization, updateSettings } from "@/server/repos/workspace"

const text = textField()
/** A text field whose content must pass a checksum validator (empty passes). */
const checked = (problem: (value: string) => string | null) =>
  text.superRefine((value, ctx) => {
    const message = problem(value)
    if (message) ctx.addIssue({ code: "custom", message })
  })
const prefix = z
  .string()
  .trim()
  .min(1)
  .max(12)
  .regex(/^[A-Za-z0-9-_/]+$/, "Prefixes may only contain letters, digits, - _ /")

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
  vatId: checked(vatIdProblem),
  bankIban: checked(ibanProblem),
  bankBic: checked(bicProblem),
  ukSortCode: checked(sortCodeProblem),
  ukAccountNumber: checked(accountNumberProblem),
  usRoutingNumber: checked(routingNumberProblem),
  invoicePrefix: prefix,
  quotePrefix: prefix,
  creditNotePrefix: prefix,
  remindersEnabled: checkbox,
  reminderDays: z
    .string()
    .transform((v) =>
      [
        ...new Set(
          v
            .split(/[s,;]+/)
            .filter(Boolean)
            .map(Number)
        ),
      ].sort((a, b) => a - b)
    )
    .pipe(z.array(z.number().int().min(1, "Reminder days must be at least 1").max(365)).max(5, "At most 5 reminders")),
  lateFeePercent: z.coerce.number().min(0).max(20, "Late fees above 20 % are not allowed"),
  vatAccounting: z.enum(["accrual", "cash"]),
  defaultPaymentTermsDays: z.coerce.number().int().min(0).max(365),
  // Blank clears the balance; otherwise it must parse as an amount (overdrafts allowed) with a date.
  bankBalance: z
    .string()
    .default("")
    .transform((v, ctx) => {
      if (!v.trim()) return null
      const minor = parseAmountInput(v)
      if (minor === null) ctx.addIssue({ code: "custom", message: "Enter the bank balance as an amount, e.g. 12,500.00" })
      return minor
    }),
  bankBalanceDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).default(""),
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
  const {
    businessName,
    advisoryOptIn,
    taxRegistered,
    smallBusinessExempt,
    vatFilingFrequency,
    vatPeriodEndMonth,
    deDauerfrist,
    lateFeePercent,
    bankBalance,
    bankBalanceDate,
    ...profile
  } = parsed.data
  const next = {
    ...profile,
    bankBalanceMinor: bankBalance,
    bankBalanceDate: bankBalance === null ? null : bankBalanceDate || ctx.today,
    lateFeeBp: Math.round(lateFeePercent * 100),
    ...normalizeTaxProfile(ctx.jurisdiction, { taxRegistered, smallBusinessExempt, vatFilingFrequency, vatPeriodEndMonth, deDauerfrist }),
    advisoryOptIn,
    advisoryOptInAt: advisoryOptIn && !ctx.settings.advisoryOptIn ? new Date() : advisoryOptIn ? ctx.settings.advisoryOptInAt : null,
  }
  renameOrganization(db, ctx.orgId, businessName)
  updateSettings(db, ctx.orgId, next)
  // Bank details and tax ids end up on invoices: keep a before/after trail, especially for bookkeeper edits.
  const changed = Object.fromEntries(
    (Object.keys(profile) as (keyof typeof profile)[])
      .filter((k) => JSON.stringify(ctx.settings[k]) !== JSON.stringify(profile[k]))
      .map((k) => [k, { from: ctx.settings[k], to: profile[k] }])
  )
  audit(ctx, "settings.updated", "workspace", ctx.orgId, changed)
  evaluateTriggers(db, ctx.orgId)
  revalidatePath("/", "layout")
  return { ok: true }
}

export async function removeLogo() {
  const ctx = await requireReadyOrg()
  updateSettings(db, ctx.orgId, { logoPath: null })
  if (ctx.settings.logoPath) fs.rmSync(dataPath(ctx.settings.logoPath), { force: true })
  revalidatePath("/settings")
}

/** GDPR erasure: the workspace (cascading to all its data) and the owner's account, then its files. */
export async function deleteWorkspace() {
  const ctx = await requireReadyOrg()
  if (ctx.actor !== "owner") throw new Error("Only the owner can delete a workspace")
  // Database first: if anything fails, nothing user-visible is half-deleted (orphaned files are harmless).
  eraseWorkspace(db, ctx.orgId, ctx.user.role === "admin" ? null : ctx.user.id)
  for (const dir of ["uploads", "pdfs"]) fs.rmSync(dataPath(`${dir}/${ctx.orgId}`), { recursive: true, force: true })
  redirect("/")
}
