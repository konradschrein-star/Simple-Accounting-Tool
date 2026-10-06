import "server-only"
import type { Db } from "@/db/client"
import { documentEmail, reminderEmail } from "@/invoicing/emails"
import { dueReminderLevel, openAmount } from "@/invoicing/documents"
import { formatDate, todayIn, type IsoDate } from "@/lib/dates"
import { emailConfigured, sendEmail, type OutgoingEmail } from "@/lib/email"
import { env } from "@/lib/env"
import { formatMoney, roundHalfAwayFromZero } from "@/lib/money"
import { limits } from "@/lib/rate-limit"
import { invoicePdf } from "@/pdf/invoice-file"
import { exchangeRateMicro } from "@/server/repos/fx"
import {
  cancelInvoice,
  documentContext,
  finalizeDocument,
  getInvoice,
  InvoiceError,
  logEvent,
  markSent,
  overdueForReminders,
  recordReminder,
} from "@/server/repos/invoices"
import { dueSeries, failSeries, getSeries, issueNextInSeries, templateCurrency } from "@/server/repos/recurring"
import { getOrganizationName, getSettings, workspacesWithReminders, type WorkspaceSettings } from "@/server/repos/workspace"

/**
 * Invoicing use cases that need I/O around the synchronous repos: exchange rates (fetched before the transaction),
 * PDFs and email (after it). Runs from server actions and the hourly background sweep.
 */

/** Email goes out from a real workspace only — never from demo sandboxes — and is rate-limited per workspace. */
export const workspaceCanEmail = (settings: { isDemo: boolean }) => emailConfigured() && !settings.isDemo

async function sendFromWorkspace(orgId: string, settings: { isDemo: boolean }, message: OutgoingEmail): Promise<string> {
  if (!workspaceCanEmail(settings)) throw new InvoiceError("Email isn’t available in this workspace")
  if (!limits.email(orgId)) throw new InvoiceError("You’ve sent a lot of email in the last hour — please try again later")
  return sendEmail(message)
}

export const publicLink = (token: string) => `${env().BETTER_AUTH_URL}/i/${token}`

/** The rate from a document's currency into the workspace currency on `date` (1 when they are the same). */
async function rateFor(db: Db, orgId: string, currency: string, date: IsoDate): Promise<number> {
  return exchangeRateMicro(db, currency, getSettings(db, orgId).currency, date)
}

/** Issue a draft with the exchange rate of its issue date locked in. */
export async function finalizeWithRate(db: Db, orgId: string, id: string, today: IsoDate): Promise<string> {
  const found = getInvoice(db, orgId, id)
  if (!found) throw new InvoiceError("Document not found")
  return finalizeDocument(db, orgId, id, await rateFor(db, orgId, found.invoice.currency, found.invoice.issueDate), today)
}

/** Cancel by credit note, with today's rate for the credit note. */
export async function cancelWithRate(db: Db, orgId: string, id: string, today: IsoDate) {
  const found = getInvoice(db, orgId, id)
  if (!found) throw new InvoiceError("Invoice not found")
  return cancelInvoice(db, orgId, id, today, await rateFor(db, orgId, found.invoice.currency, today))
}

/** Emails an issued document with its PDF attached and a link to the online version. */
export async function sendDocument(db: Db, orgId: string, id: string, to?: string): Promise<string> {
  const ctx = documentContext(db, orgId, id)
  if (!ctx) throw new InvoiceError("Document not found")
  const { invoice, settings, snapshot } = ctx
  if (invoice.status === "draft" || !invoice.publicToken || !invoice.number) throw new InvoiceError("Issue the document before sending it")
  const recipient = to?.trim() || ctx.client?.email
  if (!recipient) throw new InvoiceError("Add an email address for this client first")
  const { subject, html } = documentEmail({
    kind: snapshot.kind,
    language: snapshot.language,
    number: invoice.number,
    sellerName: settings.legalName || getOrganizationName(db, orgId),
    clientName: ctx.client?.name ?? "",
    totalFormatted: formatMoney(invoice.totalMinor, invoice.currency, snapshot.locale),
    dueDateFormatted: formatDate(invoice.dueDate, snapshot.locale),
    link: publicLink(invoice.publicToken),
  })
  const pdf = await invoicePdf(db, orgId, ctx)
  const messageId = await sendFromWorkspace(orgId, settings, {
    to: recipient,
    subject,
    html,
    replyTo: settings.email || undefined,
    attachments: [{ filename: `${invoice.number}.pdf`, content: pdf }],
  })
  markSent(db, orgId, id, { to: recipient, messageId })
  return recipient
}

/**
 * Issues every recurring invoice that has come due (catching up missed periods of active series) and sends it when
 * the series asks for it. Each invoice is issued and the series advanced in one transaction; email follows the commit.
 */
export async function runRecurringInvoices(db: Db): Promise<number> {
  let issued = 0
  // Candidates by the world's earliest calendar day; each workspace then applies its own "today".
  for (let series of dueSeries(db, todayIn("Pacific/Kiritimati"))) {
    const settings: WorkspaceSettings = getSettings(db, series.orgId)
    const today = todayIn(settings.timezone)
    while (series.state === "active" && series.nextIssueDate <= today) {
      let id: string
      try {
        const currency = templateCurrency(db, series)
        if (!currency) throw new InvoiceError("The template of this series is gone")
        id = issueNextInSeries(db, settings, series, await rateFor(db, series.orgId, currency, series.nextIssueDate), today)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`[recurring ${series.id}] stopped:`, message)
        failSeries(db, series.id, message)
        break
      }
      issued++
      if (series.autoSend && workspaceCanEmail(settings))
        await sendDocument(db, series.orgId, id).catch((e) => logEvent(db, series.orgId, id, "send_failed", { error: String(e?.message ?? e) }))
      series = getSeries(db, series.orgId, series.id)!
    }
  }
  return issued
}

/** Sends the next due dunning level for overdue invoices in workspaces that switched reminders on. */
export async function runPaymentReminders(db: Db): Promise<number> {
  if (!emailConfigured()) return 0
  let sent = 0
  for (const settings of workspacesWithReminders(db)) {
    const today = todayIn(settings.timezone)
    for (const { invoice, client, paidMinor } of overdueForReminders(db, settings.orgId, today)) {
      const level = dueReminderLevel(invoice.dueDate, today, settings.reminderDays, invoice.reminderLevel)
      if (!level) continue
      const open = openAmount(invoice.totalMinor, paidMinor)
      const fee = level >= 2 && settings.lateFeeBp ? roundHalfAwayFromZero((open * settings.lateFeeBp) / 10000) : 0
      const { locale, language } = invoice.snapshot
      const money = (m: number) => formatMoney(m, invoice.currency, locale)
      const { subject, html } = reminderEmail({
        language,
        level,
        number: invoice.number,
        sellerName: settings.legalName || getOrganizationName(db, settings.orgId),
        clientName: client.name,
        openFormatted: money(open),
        dueDateFormatted: formatDate(invoice.dueDate, locale),
        lateFeeFormatted: fee ? money(fee) : null,
        link: publicLink(invoice.publicToken),
      })
      try {
        await sendFromWorkspace(settings.orgId, settings, { to: client.email, subject, html, replyTo: settings.email || undefined })
        recordReminder(db, settings.orgId, invoice.id, level, fee)
        sent++
      } catch (error) {
        console.warn(`[reminders ${invoice.id}]`, error instanceof Error ? error.message : error)
      }
    }
  }
  return sent
}
