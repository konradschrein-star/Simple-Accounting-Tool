import { createHash } from "node:crypto"
import { evaluateTriggers, workspaceMetrics } from "@/advisory/evaluate"
import { draftSummary } from "@/bookkeeping/pnl"
import type { Db } from "@/db/client"
import { categorizationRules, transactions } from "@/db/schema"
import type { DocumentKind } from "@/invoicing/documents"
import type { DraftLine } from "@/invoicing/rules"
import { getJurisdiction, type JurisdictionCode } from "@/jurisdictions"
import { addDays, addMonths, dayOfMonth, daysBetween, lastDayOfMonth, monthKey, monthLabel, type IsoDate } from "@/lib/dates"
import { computeTotals } from "@/lib/money"
import { closePeriod, monthChecklist, monthPnl } from "@/server/repos/books"
import { createClient } from "@/server/repos/clients"
import { cancelInvoice, createDraft, finalizeDocument, recordPayment, saveDraft, setQuoteOutcome } from "@/server/repos/invoices"
import { listAccounts } from "@/server/repos/ledger"
import { bumpProductUsage, saveProduct } from "@/server/repos/products"
import { createSeries } from "@/server/repos/recurring"
import { applyJurisdiction, getSettings, renameOrganization, updateSettings } from "@/server/repos/workspace"
import { PERSONAS } from "./personas"

const DEMO_MARGIN_BP = 1500
/** Demo documents are in the workspace currency, so the locked exchange rate is 1. */
const SAME_CURRENCY = 1_000_000

/** Small deterministic PRNG so every demo of a jurisdiction looks the same. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Fills a fresh workspace with nine months of believable activity: invoices in every state, a categorized
 * ledger, a review queue with AI suggestions, rules, one closed month, and live advisory alerts.
 */
export function seedDemoWorkspace(db: Db, orgId: string, userId: string, code: JurisdictionCode, today: IsoDate) {
  const persona = PERSONAS[code]
  const jurisdiction = getJurisdiction(code)
  const random = rng(code.charCodeAt(0) * 31 + code.charCodeAt(1))

  applyJurisdiction(db, orgId, code)
  renameOrganization(db, orgId, persona.business.name)
  updateSettings(db, orgId, {
    ...persona.business,
    taxRegistered: code !== "us",
    vatFilingFrequency: code === "us" ? "none" : "quarterly",
    advisoryOptIn: true,
    advisoryOptInAt: new Date(),
  })
  const settings = getSettings(db, orgId)
  const accounts = new Map(listAccounts(db, orgId).map((a) => [a.code, a]))
  const incomeAccount = jurisdiction.chartOfAccounts.find((a) => a.kind === "income")!.code
  const clients = persona.clients.map((c) => createClient(db, orgId, { ...c, addressLine2: "", vatId: "" }))
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

  // ── Invoicing: documents are issued in date order, so every number range reads chronologically ──
  const products = persona.services.map((s) =>
    saveProduct(db, orgId, null, { name: s.description, description: "", unit: "", unitPriceMinor: s.unitPriceMinor, taxRateBp: settings.defaultTaxRateBp })
  )
  products.slice(0, 2).forEach((p) => bumpProductUsage(db, orgId, p.id))
  const line = (serviceIndex: number, qty: number): DraftLine => ({
    description: persona.services[serviceIndex].description,
    quantityMilli: qty * 1000,
    unitPriceMinor: persona.services[serviceIndex].unitPriceMinor,
    taxRateBp: settings.defaultTaxRateBp,
  })
  const issue = (id: string) => finalizeDocument(db, orgId, jurisdiction, id, SAME_CURRENCY)
  const plan: { date: IsoDate; run: () => void }[] = []

  // A revenue ramp that crosses the 10k milestone in the current month.
  const paidInvoices: { id: string; number: string; paidDate: IsoDate; total: number; client: string }[] = []
  for (let offset = -8; offset <= 0; offset++) {
    const [y, m] = addMonths(monthKey(today), offset).split("-").map(Number)
    const monthTarget = 520000 + (offset + 8) * 70000 + Math.round(random() * 60000)
    const issueDays = offset === 0 ? [1, 3, Math.min(5, Number(today.slice(8)))] : [3, 17]
    issueDays.forEach((day, i) => {
      const issueDate = dayOfMonth(y, m, Math.min(day, 28))
      if (issueDate > today) return
      const client = clients[(offset + 8 + i) % clients.length]
      const service = persona.services[(offset + 8 + i * 3) % persona.services.length]
      const share = offset === 0 ? [0.45, 0.35, 0.3][i] : i === 0 ? 0.55 : 0.45
      const qtyMilli = Math.max(1000, Math.round((monthTarget * share) / service.unitPriceMinor) * 1000)
      const lines = [
        { description: service.description, quantityMilli: qtyMilli, unitPriceMinor: service.unitPriceMinor, taxRateBp: settings.defaultTaxRateBp },
      ]
      const isDraft = offset === 0 && i === issueDays.length - 1
      const overdueOne = offset === -2 && i === 1 // stays unpaid → overdue
      const paidDate = addDays(issueDate, 9 + Math.round(random() * 12))
      const paid = daysBetween(issueDate, today) > 14 && !overdueOne && paidDate <= today
      plan.push({
        date: issueDate,
        run: () => {
          const id = draft("invoice", client.id, issueDate, lines)
          if (isDraft) return
          const number = issue(id)
          if (paid) paidInvoices.push({ id, number, paidDate, total: computeTotals(lines).totalMinor, client: client.name })
        },
      })
    })
  }

  // Quotes in every state, a part-paid invoice, and a mistaken invoice cancelled by credit note (Stornorechnung).
  plan.push(
    {
      date: addDays(today, -40),
      run: () => {
        const won = draft("quote", clients[1].id, addDays(today, -40), [line(3, 1)])
        issue(won)
        setQuoteOutcome(db, orgId, won, "accepted")
      },
    },
    { date: addDays(today, -6), run: () => void issue(draft("quote", clients[3].id, addDays(today, -6), [line(0, 2), line(1, 40)])) },
    { date: today, run: () => void draft("quote", clients[2].id, today, [line(0, 1)]) },
    {
      date: addDays(today, -12),
      run: () => {
        const partial = draft("invoice", clients[2].id, addDays(today, -12), [line(1, 24)])
        issue(partial)
        recordPayment(db, orgId, partial, { date: addDays(today, -4), amountMinor: Math.round(computeTotals([line(1, 24)]).totalMinor / 2), method: "manual" })
      },
    },
    {
      date: addDays(today, -95),
      run: () => {
        const mistaken = draft("invoice", clients[0].id, addDays(today, -95), [line(3, 1)])
        issue(mistaken)
        cancelInvoice(db, orgId, jurisdiction, mistaken, addDays(today, -95), SAME_CURRENCY)
      },
    }
  )
  plan.sort((a, b) => a.date.localeCompare(b.date)).forEach((p) => p.run())

  // A monthly retainer that bills itself from the 1st of next month.
  const nextMonth = addMonths(monthKey(today), 1)
  const retainerTemplate = draft("invoice", clients[0].id, `${nextMonth}-01`, [line(2, 1)])
  createSeries(db, orgId, {
    templateInvoiceId: retainerTemplate,
    frequency: "monthly",
    nextIssueDate: `${nextMonth}-01`,
    endDate: null,
    remaining: null,
    autoSend: false,
  })

  // ── Ledger ──
  type Row = {
    date: IsoDate
    description: string
    counterparty: string
    amountMinor: number
    code: string | null
    source: "rule" | "ai" | "heuristic" | null
    review: "ok" | "needs_review"
    confidence?: number
    invoiceId?: string
  }
  const rows: Row[] = paidInvoices.map((p) => ({
    date: p.paidDate,
    description: `Payment ${p.number}`,
    counterparty: p.client,
    amountMinor: p.total,
    code: incomeAccount,
    source: "heuristic",
    review: "ok",
    invoiceId: p.id,
  }))
  for (let offset = -8; offset <= 0; offset++) {
    const [y, m] = addMonths(monthKey(today), offset).split("-").map(Number)
    for (const v of persona.vendors) {
      if (v.every === "quarter" && m % 3 !== 1) continue
      const date = dayOfMonth(y, m, v.day)
      if (date <= today)
        rows.push({
          date,
          description: v.description,
          counterparty: v.counterparty,
          amountMinor: -v.amountMinor,
          code: v.accountCode,
          source: random() > 0.4 ? "rule" : "ai",
          review: "ok",
        })
    }
    const drawDate = dayOfMonth(y, m, 25)
    if (drawDate <= today)
      rows.push({
        date: drawDate,
        description: "Owner drawing",
        counterparty: persona.owner,
        amountMinor: -(200000 + Math.round(random() * 50000)),
        code: persona.ownerCode,
        source: "rule",
        review: "ok",
      })
    if (m % 3 === 0 && drawDate <= today)
      rows.push({
        date: lastDayOfMonth(y, m),
        description: "Transfer to savings",
        counterparty: persona.owner,
        amountMinor: -300000,
        code: persona.transferCode,
        source: "heuristic",
        review: "ok",
      })
  }
  persona.recentOneOffs.forEach((o, i) => {
    rows.push({
      date: addDays(today, -3 - i * 5),
      description: o.description,
      counterparty: o.counterparty,
      amountMinor: -o.amountMinor,
      code: o.suggestedCode,
      source: "ai",
      review: "needs_review",
      confidence: o.confidence,
    })
  })
  const inserted = db
    .insert(transactions)
    .values(
      rows.map((r, i) => ({
        orgId,
        date: r.date,
        description: r.description,
        counterparty: r.counterparty,
        amountMinor: r.amountMinor,
        ledgerAccountId: r.code ? (accounts.get(r.code)?.id ?? null) : null,
        categorizationSource: r.source,
        aiConfidenceBp: r.confidence ? Math.round(r.confidence * 10000) : null,
        reviewStatus: r.review,
        invoiceId: r.invoiceId ?? null,
        dedupeHash: createHash("sha256").update(`demo|${orgId}|${i}`).digest("hex"),
      }))
    )
    .returning({ id: transactions.id })
    .all()
  // Bank-matched payments, exactly as committing a statement would record them.
  rows.forEach((r, i) => {
    if (r.invoiceId) recordPayment(db, orgId, r.invoiceId, { date: r.date, amountMinor: r.amountMinor, method: "bank", transactionId: inserted[i].id })
  })

  // The story needs a visible margin squeeze: size one subcontractor bill so the 90-day margin lands near 15 %.
  const t90 = workspaceMetrics(db, orgId, today).trailing90
  const topUp = Math.round(t90.cashInMinor * (1 - DEMO_MARGIN_BP / 10000)) - t90.expensesMinor
  if (topUp > 0) {
    const contractor = persona.recentOneOffs[2]
    db.insert(transactions)
      .values({
        orgId,
        date: addDays(today, -30),
        description: `${contractor.description} – project delivery`,
        counterparty: contractor.counterparty,
        amountMinor: -topUp,
        ledgerAccountId: accounts.get(contractor.suggestedCode)?.id ?? null,
        categorizationSource: "rule",
        reviewStatus: "ok",
        dedupeHash: createHash("sha256").update(`demo|${orgId}|topup`).digest("hex"),
      })
      .run()
  }

  db.insert(categorizationRules)
    .values(
      persona.vendors.slice(0, 3).map((v, i) => ({
        orgId,
        matchField: "counterparty" as const,
        matchType: "equals" as const,
        pattern: v.counterparty,
        sign: "debit" as const,
        ledgerAccountId: accounts.get(v.accountCode)!.id,
        priority: 100 + i,
        hitCount: 8,
      }))
    )
    .run()

  // ── One closed month with a written summary ──
  const period = addMonths(monthKey(today), -2)
  const summary = draftSummary({
    monthLabel: monthLabel(period),
    pnl: monthPnl(db, orgId, period),
    currency: settings.currency,
    locale: settings.locale,
    overdueMinor: 0,
    nextDeadline: null,
  })
  closePeriod(db, orgId, period, userId, monthChecklist(db, orgId, period), summary)

  evaluateTriggers(db, orgId)
  return { invoices: paidInvoices.length, transactions: rows.length, closedPeriod: period }
}
