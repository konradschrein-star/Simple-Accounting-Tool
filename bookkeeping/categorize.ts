import type { LedgerAccountKind } from "@/jurisdictions/types"

export type AccountRef = { id: string; code: string; name: string; kind: LedgerAccountKind; taxLine: string | null }

export type Rule = {
  id: string
  matchField: "description" | "counterparty"
  matchType: "contains" | "equals" | "regex"
  pattern: string
  sign: "credit" | "debit" | "any"
  ledgerAccountId: string
  priority: number
  approved: boolean
}

export type Uncategorized = { id: string; description: string; counterparty: string; amountMinor: number; invoiceId: string | null }

export type Assignment = { accountId: string; source: "heuristic" | "rule"; ruleId?: string }

const TRANSFER_RE = /\b(umbuchung|übertrag|uebertrag|eigenübertrag|transfer to|transfer from|own account|savings|sparkonto|tagesgeld)\b/i
const TAX_RE = /\b(finanzamt|hmrc|irs usataxpymt|eftps|revenue jersey|comptroller of revenue)\b/i

export function normalizeCounterparty(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(gmbh|ag|ltd|limited|llc|inc|plc|co|kg|ug)\b\.?/g, "")
    .replace(/[^a-z0-9äöüß ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function ruleMatches(rule: Rule, txn: Uncategorized): boolean {
  if (!rule.approved) return false
  if (rule.sign === "credit" && txn.amountMinor <= 0) return false
  if (rule.sign === "debit" && txn.amountMinor >= 0) return false
  const subject = rule.matchField === "counterparty" ? txn.counterparty || txn.description : txn.description
  switch (rule.matchType) {
    case "equals":
      return normalizeCounterparty(subject) === normalizeCounterparty(rule.pattern)
    case "contains":
      return subject.toLowerCase().includes(rule.pattern.toLowerCase())
    case "regex":
      try {
        return new RegExp(rule.pattern, "i").test(subject)
      } catch {
        return false
      }
  }
}

function firstOfKind(accounts: AccountRef[], kind: LedgerAccountKind, preferCode?: string): AccountRef | undefined {
  return (preferCode && accounts.find((a) => a.code === preferCode)) || accounts.find((a) => a.kind === kind)
}

/**
 * Deterministic pass: heuristics (invoice-matched income, own-account transfers, tax payments) then
 * user rules by priority. Whatever remains goes to the AI pass.
 */
export function categorizeDeterministic(
  txns: Uncategorized[],
  accounts: AccountRef[],
  rules: Rule[],
  opts: { incomeCode?: string } = {},
): Map<string, Assignment> {
  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority)
  const income = firstOfKind(accounts, "income", opts.incomeCode)
  const transfer = firstOfKind(accounts, "transfer")
  const tax = firstOfKind(accounts, "tax")
  const result = new Map<string, Assignment>()
  for (const txn of txns) {
    const text = `${txn.description} ${txn.counterparty}`
    if (txn.invoiceId && txn.amountMinor > 0 && income) {
      result.set(txn.id, { accountId: income.id, source: "heuristic" })
      continue
    }
    const rule = sortedRules.find((r) => ruleMatches(r, txn))
    if (rule) {
      result.set(txn.id, { accountId: rule.ledgerAccountId, source: "rule", ruleId: rule.id })
      continue
    }
    if (TRANSFER_RE.test(text) && transfer) result.set(txn.id, { accountId: transfer.id, source: "heuristic" })
    else if (TAX_RE.test(text) && txn.amountMinor < 0 && tax) result.set(txn.id, { accountId: tax.id, source: "heuristic" })
  }
  return result
}

/** Suggests a reusable rule from a human correction: exact counterparty when present, else a description keyword. */
export function suggestRule(txn: Uncategorized, accountId: string): Omit<Rule, "id" | "priority" | "approved"> | null {
  const counterparty = normalizeCounterparty(txn.counterparty)
  if (counterparty.length >= 3)
    return { matchField: "counterparty", matchType: "equals", pattern: txn.counterparty.trim(), sign: txn.amountMinor < 0 ? "debit" : "credit", ledgerAccountId: accountId }
  const keyword = txn.description
    .split(/\s+/)
    .filter((w) => /^[a-zäöüß]{4,}$/i.test(w))
    .sort((a, b) => b.length - a.length)[0]
  return keyword ? { matchField: "description", matchType: "contains", pattern: keyword, sign: txn.amountMinor < 0 ? "debit" : "credit", ledgerAccountId: accountId } : null
}
