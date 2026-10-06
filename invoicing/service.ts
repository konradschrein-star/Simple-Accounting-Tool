import "server-only"
import { and, eq, inArray } from "drizzle-orm"
import type { Db } from "@/db/client"
import { clients, invoiceEvents, invoices, workspaceSettings } from "@/db/schema"
import { getJurisdiction, type Jurisdiction } from "@/jurisdictions"
import { formatDate, todayIn } from "@/lib/dates"
import { emailConfigured, sendEmail } from "@/lib/email"
import { env } from "@/lib/env"
import { formatMoney, roundHalfAwayFromZero, type CurrencyCode } from "@/lib/money"
import { invoicePdf } from "@/pdf/invoice-file"
import { exchangeRateMicro } from "@/server/repos/fx"
import { deleteDraft, duplicateDocument, finalizeDocument, getInvoice, logEvent, markSent, previewContext, InvoiceError } from "@/server/repos/invoices"
import { dueSeries, updateSeries } from "@/server/repos/recurring"
import { getOrganizationName, getSettings } from "@/server/repos/workspace"
import { dueReminderLevel, nextRecurrence, openAmount } from "./documents"
import { documentEmail, reminderEmail } from "./emails"

export const publicLink = (token: string) => `${env().BETTER_AUTH_URL}/i/${token}`

/** Finalize with the exchange rate of the issue date locked in (needed before the synchronous finalize). */
export async function finalizeWithRate(db: Db, orgId: string, jurisdiction: Jurisdiction, id: string): Promise<string> {
  const found = getInvoice(db, orgId, id)
  if (!found) throw new InvoiceError("Document not found")
  const settings = getSettings(db, orgId)
  const rate = await exchangeRateMicro(db, found.invoice.currency, settings.currency, found.invoice.issueDate)
  return finalizeDocument(db, orgId, jurisdiction, id, rate)
}

/** Emails a finalized document with its PDF attached and a link to the online version. */
export async function sendDocument(db: Db, orgId: string, jurisdiction: Jurisdiction, id: string, to?: string): Promise<string> {
  const ctx = previewContext(db, orgId, jurisdiction, id)
  if (!ctx) throw new InvoiceError("Document not found")
  if (ctx.invoice.status === "draft" || !ctx.invoice.publicToken || !ctx.invoice.number) throw new InvoiceError("Finalize the document before sending it")
  const recipient = to?.trim() || ctx.client?.email
  if (!recipient) throw new InvoiceError("Add an email address for this client first")
  const settings = ctx.settings
  const sellerName = settings.legalName || getOrganizationName(db, orgId)
  const language = ctx.client?.language ?? jurisdiction.invoiceLanguage
  const locale = ctx.snapshot.locale
  const { subject, html } = documentEmail({
    kind: ctx.invoice.kind,
    language,
    number: ctx.invoice.number,
    sellerName,
    clientName: ctx.client?.name ?? "",
    totalFormatted: formatMoney(ctx.invoice.totalMinor, ctx.invoice.currency, locale),
    dueDateFormatted: formatDate(ctx.invoice.dueDate, locale),
    link: publicLink(ctx.invoice.publicToken),
  })
  const pdf = await invoicePdf(db, orgId, ctx)
  const messageId = await sendEmail({
    to: recipient,
    subject,
    html,
    replyTo: settings.email || undefined,
    attachments: [{ filename: `${ctx.invoice.number}.pdf`, content: pdf }],
  })
  markSent(db, orgId, id, { to: recipient, messageId })
  return recipient
}

/**
 * Generates every recurring invoice that has come due (catching up missed periods), finalizes it and,
 * when the series asks for it and email is configured, sends it. Runs from the hourly background sweep.
 */
export async function runRecurringInvoices(db: Db): Promise<number> {
  let generated = 0
  // Candidates by the world's earliest calendar day; each workspace then applies its own "today".
  for (const series of dueSeries(db, todayIn("Pacific/Kiritimati"))) {
    const settings = getSettings(db, series.orgId)
    if (!settings.jurisdiction) continue
    const jurisdiction = getJurisdiction(settings.jurisdiction)
    const today = todayIn(settings.timezone)
    let { nextIssueDate, generatedCount, remaining } = series
    while (nextIssueDate <= today && (remaining === null || remaining > 0) && (!series.endDate || nextIssueDate <= series.endDate)) {
      let id: string | null = null
      try {
        id = duplicateDocument(db, series.orgId, settings, nextIssueDate, series.templateInvoiceId, "invoice", { recurringSeriesId: series.id })
        await finalizeWithRate(db, series.orgId, jurisdiction, id)
        logEvent(db, series.orgId, id, "generated", { seriesId: series.id })
        const generatedId = id
        if (series.autoSend && emailConfigured())
          await sendDocument(db, series.orgId, jurisdiction, generatedId).catch((e) =>
            logEvent(db, series.orgId, generatedId, "send_failed", { error: String(e?.message ?? e) })
          )
        generated++
      } catch (error) {
        // Most likely the template lost required data (e.g. client address); pause rather than retry hourly.
        console.warn(`[recurring ${series.id}] paused:`, error instanceof Error ? error.message : error)
        if (id && getInvoice(db, series.orgId, id)?.invoice.status === "draft") deleteDraft(db, series.orgId, id)
        updateSeries(db, series.orgId, series.id, { active: false })
        break
      }
      generatedCount++
      remaining = remaining === null ? null : remaining - 1
      nextIssueDate = nextRecurrence(series.anchorDate, series.frequency, generatedCount)
      updateSeries(db, series.orgId, series.id, { nextIssueDate, generatedCount, remaining, active: remaining === null || remaining > 0 })
    }
  }
  return generated
}

/** Sends the next due dunning level for overdue invoices in workspaces that enabled reminders. */
export async function runPaymentReminders(db: Db): Promise<number> {
  if (!emailConfigured()) return 0
  let sent = 0
  const workspaces = db.select().from(workspaceSettings).where(eq(workspaceSettings.remindersEnabled, true)).all()
  for (const settings of workspaces) {
    if (!settings.jurisdiction) continue
    const jurisdiction = getJurisdiction(settings.jurisdiction)
    const today = todayIn(settings.timezone)
    const overdue = db
      .select({ invoice: invoices, client: clients })
      .from(invoices)
      .innerJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.orgId, invoices.orgId)))
      .where(and(eq(invoices.orgId, settings.orgId), eq(invoices.kind, "invoice"), eq(invoices.status, "finalized")))
      .all()
      .filter((r) => r.invoice.dueDate < today && r.client.email && r.invoice.publicToken)
    if (!overdue.length) continue
    const levels = new Map<string, number>()
    for (const e of db
      .select()
      .from(invoiceEvents)
      .where(
        and(
          eq(invoiceEvents.type, "reminder"),
          inArray(
            invoiceEvents.invoiceId,
            overdue.map((r) => r.invoice.id)
          )
        )
      )
      .all())
      levels.set(e.invoiceId, Math.max(levels.get(e.invoiceId) ?? 0, Number(e.detail?.level ?? 0)))
    for (const { invoice, client } of overdue) {
      const level = dueReminderLevel(invoice.dueDate, today, settings.reminderDays, levels.get(invoice.id) ?? 0)
      if (!level) continue
      const found = getInvoice(db, settings.orgId, invoice.id)!
      const open = openAmount(invoice.totalMinor, found.paidMinor)
      const fee = level >= 2 && settings.lateFeeBp ? roundHalfAwayFromZero((open * settings.lateFeeBp) / 10000) : 0
      const locale = invoice.snapshot?.locale ?? settings.locale
      const money = (m: number) => formatMoney(m, invoice.currency as CurrencyCode, locale)
      const { subject, html } = reminderEmail({
        language: client.language ?? jurisdiction.invoiceLanguage,
        level,
        number: invoice.number!,
        sellerName: settings.legalName || getOrganizationName(db, settings.orgId),
        clientName: client.name,
        openFormatted: money(open),
        dueDateFormatted: formatDate(invoice.dueDate, locale),
        lateFeeFormatted: fee ? money(fee) : null,
        link: publicLink(invoice.publicToken!),
      })
      try {
        await sendEmail({ to: client.email, subject, html, replyTo: settings.email || undefined })
        logEvent(db, settings.orgId, invoice.id, "reminder", { level, feeMinor: fee })
        sent++
      } catch (error) {
        console.warn(`[reminders ${invoice.id}]`, error instanceof Error ? error.message : error)
      }
    }
  }
  return sent
}
