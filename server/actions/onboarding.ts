"use server"

import { redirect } from "next/navigation"
import { z } from "zod"
import { db } from "@/db/client"
import { evaluateTriggers } from "@/advisory/evaluate"
import { getJurisdiction, JURISDICTION_CODES } from "@/jurisdictions"
import { normalizeTaxProfile } from "@/jurisdictions/tax-profile"
import { checkbox } from "@/lib/form"
import { audit, requireOrg } from "@/server/context"
import { applyJurisdiction, renameOrganization, updateSettings } from "@/server/repos/workspace"

const onboardingSchema = z.object({
  businessName: z.string().trim().min(2, "Enter your business name").max(120),
  jurisdiction: z.enum(JURISDICTION_CODES),
  legalName: z.string().trim().max(200).default(""),
  addressLine1: z.string().trim().max(200).default(""),
  postcode: z.string().trim().max(200).default(""),
  city: z.string().trim().max(200).default(""),
  email: z.string().trim().max(200).default(""),
  taxNumber: z.string().trim().max(200).default(""),
  vatId: z.string().trim().max(200).default(""),
  taxRegistered: checkbox,
  smallBusinessExempt: checkbox,
  vatFilingFrequency: z.enum(["monthly", "quarterly", "none"]).default("quarterly"),
  vatPeriodEndMonth: z.coerce.number().int().min(1).max(3).default(3),
  deDauerfrist: checkbox,
})

export type OnboardingState = { error?: string }

export async function completeOnboarding(_prev: OnboardingState, form: FormData): Promise<OnboardingState> {
  const ctx = await requireOrg()
  if (ctx.jurisdiction) redirect("/dashboard")
  const parsed = onboardingSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form" }
  const input = parsed.data

  applyJurisdiction(db, ctx.orgId, input.jurisdiction)
  renameOrganization(db, ctx.orgId, input.businessName)
  updateSettings(db, ctx.orgId, {
    legalName: input.legalName || input.businessName,
    addressLine1: input.addressLine1,
    postcode: input.postcode,
    city: input.city,
    email: input.email || ctx.user.email,
    taxNumber: input.taxNumber,
    vatId: input.vatId,
    ...normalizeTaxProfile(getJurisdiction(input.jurisdiction), input),
  })
  audit(ctx, "onboarding.completed", "workspace", ctx.orgId, { jurisdiction: input.jurisdiction })
  // First alerts (e.g. an upcoming tax deadline) should be there on the very first dashboard visit.
  evaluateTriggers(db, ctx.orgId)
  redirect("/dashboard")
}
