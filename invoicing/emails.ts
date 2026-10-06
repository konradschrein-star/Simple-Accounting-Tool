import type { DocumentKind } from "./documents"

/** Plain, deliverable HTML emails for documents and reminders (no tracking pixels — "viewed" comes from the link). */

type Language = "de" | "en"

type DocumentEmail = {
  kind: DocumentKind
  language: Language
  number: string
  sellerName: string
  clientName: string
  totalFormatted: string
  dueDateFormatted: string
  link: string
}

const COPY = {
  de: {
    invoice: {
      noun: "Rechnung",
      lead: (d: DocumentEmail) => `anbei erhalten Sie unsere Rechnung ${d.number} über ${d.totalFormatted}, zahlbar bis ${d.dueDateFormatted}.`,
    },
    quote: {
      noun: "Angebot",
      lead: (d: DocumentEmail) => `anbei erhalten Sie unser Angebot ${d.number} über ${d.totalFormatted}, gültig bis ${d.dueDateFormatted}.`,
    },
    credit_note: { noun: "Stornorechnung", lead: (d: DocumentEmail) => `anbei erhalten Sie die Stornorechnung ${d.number} über ${d.totalFormatted}.` },
    greeting: (name: string) => `Guten Tag ${name},`,
    view: "Online ansehen und bezahlen",
    viewOnly: "Online ansehen",
    closing: "Mit freundlichen Grüßen",
  },
  en: {
    invoice: { noun: "Invoice", lead: (d: DocumentEmail) => `please find attached invoice ${d.number} for ${d.totalFormatted}, due on ${d.dueDateFormatted}.` },
    quote: {
      noun: "Quote",
      lead: (d: DocumentEmail) => `please find attached our quote ${d.number} for ${d.totalFormatted}, valid until ${d.dueDateFormatted}.`,
    },
    credit_note: { noun: "Credit note", lead: (d: DocumentEmail) => `please find attached credit note ${d.number} for ${d.totalFormatted}.` },
    greeting: (name: string) => `Hello ${name},`,
    view: "View and pay online",
    viewOnly: "View online",
    closing: "Kind regards",
  },
} as const

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

function layout(paragraphs: string[], button: { label: string; href: string }, closing: string, sender: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111827">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td style="font-size:15px;line-height:1.6">
${paragraphs.map((p) => `<p style="margin:0 0 16px">${p}</p>`).join("\n")}
<p style="margin:24px 0"><a href="${escape(button.href)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${escape(button.label)}</a></p>
<p style="margin:0">${escape(closing)}<br>${escape(sender)}</p>
</td></tr></table></td></tr></table></body></html>`
}

export function documentEmail(d: DocumentEmail): { subject: string; html: string } {
  const t = COPY[d.language]
  const kind = t[d.kind]
  return {
    subject: `${kind.noun} ${d.number} – ${d.sellerName}`,
    html: layout(
      [escape(t.greeting(d.clientName)), escape(kind.lead(d))],
      { label: d.kind === "invoice" ? t.view : t.viewOnly, href: d.link },
      t.closing,
      d.sellerName
    ),
  }
}

type ReminderEmail = {
  language: Language
  level: number
  number: string
  sellerName: string
  clientName: string
  openFormatted: string
  dueDateFormatted: string
  lateFeeFormatted: string | null
  link: string
}

/** Friendly first nudge, firmer second, formal third (Mahnung). */
export function reminderEmail(r: ReminderEmail): { subject: string; html: string } {
  const de = r.language === "de"
  const subjects = de ? ["Zahlungserinnerung", "1. Mahnung", "2. Mahnung"] : ["Friendly reminder", "Payment overdue", "Final reminder"]
  const level = Math.min(r.level, 3) - 1
  const body = de
    ? [
        `unsere Rechnung ${r.number} war am ${r.dueDateFormatted} fällig. Sicher ist sie nur untergegangen – offen sind noch ${r.openFormatted}.`,
        `leider konnten wir zur Rechnung ${r.number} (fällig am ${r.dueDateFormatted}) noch keinen Zahlungseingang feststellen. Offen: ${r.openFormatted}.`,
        `trotz unserer Erinnerungen ist die Rechnung ${r.number} weiterhin offen (${r.openFormatted}). Bitte begleichen Sie den Betrag innerhalb von 7 Tagen.`,
      ][level]
    : [
        `just a friendly reminder that invoice ${r.number} was due on ${r.dueDateFormatted}. ${r.openFormatted} is still outstanding.`,
        `we haven't yet received payment for invoice ${r.number} (due ${r.dueDateFormatted}). ${r.openFormatted} remains outstanding.`,
        `despite our reminders, invoice ${r.number} is still unpaid (${r.openFormatted}). Please settle it within 7 days.`,
      ][level]
  const fee = r.lateFeeFormatted
    ? [de ? `Für den Zahlungsverzug berechnen wir eine Gebühr von ${r.lateFeeFormatted}.` : `A late payment fee of ${r.lateFeeFormatted} applies.`]
    : []
  return {
    subject: `${subjects[level]}: ${de ? "Rechnung" : "Invoice"} ${r.number} – ${r.sellerName}`,
    html: layout(
      [escape(COPY[r.language].greeting(r.clientName)), escape(body), ...fee.map(escape)],
      { label: COPY[r.language].view, href: r.link },
      COPY[r.language].closing,
      r.sellerName
    ),
  }
}
