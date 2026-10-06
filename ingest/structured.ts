import { CashManagementEndOfDayReport } from "iso20022.js"
import { Ofx } from "ofx-data-extractor"
import type { Reconciliation, RowIssue } from "@/db/schema"
import type { NormalizedRow } from "./csv/types"
import { reconcile } from "./verify"

/**
 * Bank formats that carry exact, structured data — no column guessing and no AI needed:
 * ISO 20022 CAMT.053 (the EBICS/online-banking export of German and EU banks) and OFX/QFX (UK & US banks).
 */
export type StructuredFormat = "camt" | "ofx"
export type StructuredStatement = { rows: NormalizedRow[]; reconciliation: Reconciliation | null; currency: string | null }

export class StructuredParseError extends Error {}

/** Which structured format a file is, judged by its content (extensions lie). */
export function sniffStructured(text: string): StructuredFormat | null {
  const head = text.slice(0, 4096)
  if (/<Document[^>]*camt\.05[23]/i.test(head) || (/<BkToCstmrStmt>/.test(text) && /<Ntry>/.test(text))) return "camt"
  if (/OFXHEADER\s*:/i.test(head) || /<OFX>/i.test(head)) return "ofx"
  return null
}

const isoDay = (date: Date | undefined) => (date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : null)
const clean = (value: string | undefined | null) => (value ?? "").replace(/\s+/g, " ").trim()

export function parseCamt(xml: string, workspaceCurrency: string): StructuredStatement {
  let report: CashManagementEndOfDayReport
  try {
    report = CashManagementEndOfDayReport.fromXML(xml)
  } catch (error) {
    throw new StructuredParseError(error instanceof Error ? error.message : "Unreadable CAMT file")
  }
  const signed = (amount: number, indicator: "credit" | "debit") => (indicator === "credit" ? amount : -amount)
  const rows: NormalizedRow[] = []
  for (const statement of report.statements) {
    for (const entry of statement.entries) {
      // A reversal (storno) books the opposite direction of its indicator.
      const direction = entry.reversal ? (entry.creditDebitIndicator === "credit" ? "debit" : "credit") : entry.creditDebitIndicator
      const tx = entry.transactions[0]
      // The other party: who paid us, or whom we paid. Reversals keep the original party on the opposite side.
      const counterparty = (direction === "credit" ? (tx?.debtor?.name ?? tx?.creditor?.name) : (tx?.creditor?.name ?? tx?.debtor?.name)) ?? ""
      const remittance = entry.transactions.map((t) => t.remittanceInformation).filter(Boolean).join(" ")
      const issues: RowIssue[] = []
      if (entry.currency !== workspaceCurrency) issues.push("foreign_currency")
      const date = isoDay(entry.bookingDate)
      if (!date) issues.push("unparseable_date")
      rows.push({
        rowIndex: rows.length,
        date,
        description: clean(remittance || entry.additionalInformation || entry.proprietaryCode) || "Bank transaction",
        counterparty: clean(counterparty),
        amountMinor: signed(entry.amount, direction),
        balanceMinor: null,
        raw: [date ?? "", clean(counterparty), clean(remittance), String(signed(entry.amount, direction) / 100), entry.currency, entry.accountServicerReferenceId ?? ""],
        issues,
      })
    }
  }
  // Opening (OPBD/PRCD) and closing (CLBD) booked balances let us prove the statement is complete.
  const balance = (types: string[], pick: "first" | "last") => {
    const matches = report.balances.filter((b) => types.includes(b.type))
    const b = pick === "first" ? matches[0] : matches.at(-1)
    return b ? signed(b.amount, b.creditDebitIndicator) : null
  }
  const opening = balance(["OPBD", "PRCD"], "first")
  const closing = balance(["CLBD"], "last")
  const currency = report.balances[0]?.currency ?? rows.find((r) => r.raw[4])?.raw[4] ?? null
  return { rows, reconciliation: opening !== null || closing !== null ? reconcile(rows, opening, closing) : null, currency }
}

export function parseOfx(text: string, workspaceCurrency: string): StructuredStatement {
  let normalized: ReturnType<Ofx["toNormalized"]>
  try {
    normalized = new Ofx(text, { parserMode: "lenient" }).toNormalized({ amountMode: "cents", dateMode: "iso" })
  } catch (error) {
    throw new StructuredParseError(error instanceof Error ? error.message : "Unreadable OFX file")
  }
  const rows: NormalizedRow[] = normalized.transactions.map((t, rowIndex) => {
    const cents = typeof t.amountAbs === "number" ? t.amountAbs : Number(t.amountAbs)
    const amountMinor = Number.isFinite(cents) ? (t.direction === "credit" ? cents : -cents) : null
    const posted = typeof t.postedAt === "string" ? t.postedAt.slice(0, 10) : null
    const date = posted && /^\d{4}-\d{2}-\d{2}$/.test(posted) ? posted : null
    const name = clean(t.raw?.NAME as string | undefined)
    const memo = clean(t.raw?.MEMO as string | undefined)
    const issues: RowIssue[] = []
    if (!date) issues.push("unparseable_date")
    if (amountMinor === null) issues.push("unparseable_amount")
    if (t.currency && t.currency !== workspaceCurrency) issues.push("foreign_currency")
    return {
      rowIndex,
      date,
      description: memo || name || clean(t.description) || "Bank transaction",
      counterparty: name,
      amountMinor,
      balanceMinor: null,
      raw: [posted ?? "", name, memo, amountMinor === null ? "" : String(amountMinor / 100), t.currency ?? "", t.fitId],
      issues,
    }
  })
  return { rows, reconciliation: null, currency: normalized.transactions[0]?.currency ?? null }
}

export function parseStructured(format: StructuredFormat, text: string, workspaceCurrency: string): StructuredStatement {
  return format === "camt" ? parseCamt(text, workspaceCurrency) : parseOfx(text, workspaceCurrency)
}
