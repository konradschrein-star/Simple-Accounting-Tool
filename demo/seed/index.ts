import { evaluateTriggers } from "@/advisory/evaluate"
import { draftSummary } from "@/bookkeeping/pnl"
import type { Db } from "@/db/client"
import { getJurisdiction, type JurisdictionCode } from "@/jurisdictions"
import { addDays, addMonths, monthKey, monthLabel, type IsoDate } from "@/lib/dates"
import { writeUpload } from "@/lib/storage"
import { closePeriod, monthChecklist, monthPnl } from "@/server/repos/books"
import { clientInputSchema, createClient } from "@/server/repos/clients"
import { listAccounts } from "@/server/repos/ledger"
import { applyJurisdiction, getSettings, renameOrganization, updateSettings } from "@/server/repos/workspace"
import { PERSONAS } from "../personas"
import { byRole, rng, type SeedContext } from "./context"
import { seedInvoices } from "./invoices"
import { seedLedger, seedRules, squeezeMargin } from "./ledger"
import { seedReceipts } from "./receipts"

/**
 * Fills a fresh workspace with nine months of believable activity: documents in every state, a categorized ledger,
 * a review queue with AI suggestions, receipts, rules, one closed month, a bank balance and live advisory alerts.
 * All database work is one transaction (a failure leaves no half-seeded demo); receipt files are written after it.
 */
export function seedDemoWorkspace(db: Db, orgId: string, userId: string, code: JurisdictionCode, today: IsoDate) {
  const persona = PERSONAS[code]
  const jurisdiction = getJurisdiction(code)

  const { files, closedPeriod } = db.transaction(() => {
    applyJurisdiction(db, orgId, code)
    renameOrganization(db, orgId, persona.business.name)
    updateSettings(db, orgId, {
      ...persona.business,
      taxRegistered: persona.taxRegistered,
      vatFilingFrequency: persona.taxRegistered ? "quarterly" : "none",
      advisoryOptIn: true,
      advisoryOptInAt: new Date(),
    })
    const accounts = new Map(listAccounts(db, orgId).map((a) => [a.code, a.id]))
    const clients = new Map(persona.clients.map((c) => [c.role, createClient(db, orgId, clientInputSchema.parse(c))]))
    const ctx: SeedContext = {
      db,
      orgId,
      userId,
      today,
      persona,
      jurisdiction,
      settings: getSettings(db, orgId),
      random: rng(code.charCodeAt(0) * 31 + code.charCodeAt(1)),
      accountId: (accountCode) => {
        const id = accounts.get(accountCode)
        if (!id) throw new Error(`Demo persona uses unknown account ${accountCode}`)
        return id
      },
      client: (role) => clients.get(role)!,
      service: (role) => byRole(persona.services, role, "service"),
    }

    const paid = seedInvoices(ctx)
    const booked = seedLedger(ctx, paid)
    const files = seedReceipts(ctx, booked)
    squeezeMargin(ctx)
    seedRules(ctx)

    const period = addMonths(monthKey(today), -2)
    const summary = draftSummary({
      monthLabel: monthLabel(period),
      pnl: monthPnl(db, orgId, period),
      currency: ctx.settings.currency,
      locale: ctx.settings.locale,
      overdueMinor: 0,
      nextDeadline: null,
    })
    closePeriod(db, orgId, period, userId, monthChecklist(db, orgId, period), summary)
    updateSettings(db, orgId, { bankBalanceMinor: persona.openingBalanceMinor, bankBalanceDate: addDays(today, -35) })
    evaluateTriggers(db, orgId)
    return { files, closedPeriod: period }
  })

  for (const file of files) writeUpload(file.path, file.bytes)
  return { closedPeriod }
}
