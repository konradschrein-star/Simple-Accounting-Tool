import type { DocumentKind } from "@/invoicing/documents"
import type { DraftLine } from "@/invoicing/rules"
import { addDays, addMonths, dayOfMonth, daysBetween, monthKey, type IsoDate } from "@/lib/dates"
import { computeTotals, FX_ONE } from "@/lib/money"
import { cancelInvoice, createDraft, finalizeDocument, recordPayment, saveDraft, setQuoteOutcome } from "@/server/repos/invoices"
import { bumpProductUsage, saveProduct } from "@/server/repos/products"
import { createSeries } from "@/server/repos/recurring"
import type { ServiceRole } from "../personas"
import type { SeedContext } from "./context"

/** An invoice the bank statement later shows as paid. */
export type PaidInvoice = { id: string; number: string; paidDate: IsoDate; totalMinor: number; clientName: string }

/**
 * Nine months of invoicing that reads chronologically in every number range: a revenue ramp crossing the 10k
 * milestone this month, quotes in each state, a part-paid invoice, a Stornorechnung, a catalog and a retainer.
 */
export function seedInvoices(ctx: SeedContext): PaidInvoice[] {
  const { db, orgId, settings, today, persona, jurisdiction, random } = ctx
  const rate = settings.defaultTaxRateBp
  const line = (role: ServiceRole, qty: number): DraftLine => {
    const s = ctx.service(role)
    return { description: s.description, quantityMilli: qty * 1000, unitPriceMinor: s.unitPriceMinor, taxRateBp: rate }
  }
  const draft = (kind: DocumentKind, clientId: string, issueDate: IsoDate, lines: DraftLine[]) => {
    const id = createDraft(db, orgId, settings, issueDate, { kind, clientId })
    const dueDate = addDays(issueDate, kind === "quote" ? 30 : settings.defaultPaymentTermsDays)
    saveDraft(db, orgId, id, {
      clientId,
      currency: settings.currency,
      issueDate,
      serviceDate: issueDate,
      dueDate,
      notes: "",
      paymentTerms: "",
      stripePaymentLink: "",
      lines,
    })
    return id
  }
  const issue = (id: string) => finalizeDocument(db, orgId, jurisdiction, id, FX_ONE)

  const products = persona.services.map((s) =>
    saveProduct(db, orgId, null, { name: s.description, description: "", unit: "", unitPriceMinor: s.unitPriceMinor, taxRateBp: rate })
  )
  products.slice(0, 2).forEach((p) => bumpProductUsage(db, orgId, p.id))

  // Documents are created in date order so INV/QUO/CN numbers ascend with their dates.
  const plan: { date: IsoDate; run: () => void }[] = []
  const paid: PaidInvoice[] = []
  for (let offset = -8; offset <= 0; offset++) {
    const [y, m] = addMonths(monthKey(today), offset).split("-").map(Number)
    const monthTarget = 520000 + (offset + 8) * 70000 + Math.round(random() * 60000)
    const issueDays = offset === 0 ? [1, 3, Math.min(5, Number(today.slice(8)))] : [3, 17]
    issueDays.forEach((day, i) => {
      const issueDate = dayOfMonth(y, m, Math.min(day, 28))
      if (issueDate > today) return
      const client = persona.clients[(offset + 8 + i) % persona.clients.length]
      const service = persona.services[(offset + 8 + i * 3) % persona.services.length]
      const share = offset === 0 ? [0.45, 0.35, 0.3][i] : i === 0 ? 0.55 : 0.45
      const lines = [
        {
          description: service.description,
          quantityMilli: Math.max(1000, Math.round((monthTarget * share) / service.unitPriceMinor) * 1000),
          unitPriceMinor: service.unitPriceMinor,
          taxRateBp: rate,
        },
      ]
      const isDraft = offset === 0 && i === issueDays.length - 1
      const staysOverdue = offset === -2 && i === 1
      const paidDate = addDays(issueDate, 9 + Math.round(random() * 12))
      const getsPaid = daysBetween(issueDate, today) > 14 && !staysOverdue && paidDate <= today
      plan.push({
        date: issueDate,
        run: () => {
          const id = draft("invoice", ctx.client(client.role).id, issueDate, lines)
          if (isDraft) return
          const number = issue(id)
          if (getsPaid) paid.push({ id, number, paidDate, totalMinor: computeTotals(lines).totalMinor, clientName: client.name })
        },
      })
    })
  }

  plan.push(
    {
      date: addDays(today, -95),
      run: () => {
        const mistaken = draft("invoice", ctx.client("retainer").id, addDays(today, -95), [line("project", 1)])
        issue(mistaken)
        cancelInvoice(db, orgId, jurisdiction, mistaken, addDays(today, -95), FX_ONE)
      },
    },
    {
      date: addDays(today, -40),
      run: () => {
        const won = draft("quote", ctx.client("acceptedQuote").id, addDays(today, -40), [line("project", 1)])
        issue(won)
        setQuoteOutcome(db, orgId, won, "accepted")
      },
    },
    {
      date: addDays(today, -12),
      run: () => {
        const lines = [line("hourly", 24)]
        const partial = draft("invoice", ctx.client("partPaid").id, addDays(today, -12), lines)
        issue(partial)
        recordPayment(db, orgId, partial, { date: addDays(today, -4), amountMinor: Math.round(computeTotals(lines).totalMinor / 2), method: "manual" })
      },
    },
    { date: addDays(today, -6), run: () => void issue(draft("quote", ctx.client("openQuote").id, addDays(today, -6), [line("day", 2), line("hourly", 40)])) },
    { date: today, run: () => void draft("quote", ctx.client("partPaid").id, today, [line("day", 1)]) }
  )
  plan.sort((a, b) => a.date.localeCompare(b.date)).forEach((p) => p.run())

  // A monthly retainer that bills itself from the 1st of next month.
  const firstOfNextMonth = `${addMonths(monthKey(today), 1)}-01`
  const template = draft("invoice", ctx.client("retainer").id, firstOfNextMonth, [line("retainer", 1)])
  createSeries(db, orgId, {
    templateInvoiceId: template,
    frequency: "monthly",
    nextIssueDate: firstOfNextMonth,
    endDate: null,
    remaining: null,
    autoSend: false,
  })
  return paid
}
