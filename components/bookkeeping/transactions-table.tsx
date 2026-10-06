"use client"

import { Trash2Icon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useServerAction } from "@/components/use-server-action"
import type { AccountRef } from "@/bookkeeping/categorize"
import { formatDate } from "@/lib/dates"
import type { CurrencyCode } from "@/lib/money"
import { assignAccount, removeTransaction } from "@/server/actions/bookkeeping"
import { AccountSelect } from "./account-select"
import { SignedAmount, TxnDescription } from "./txn-cells"

export type LedgerRow = {
  id: string
  date: string
  description: string
  counterparty: string
  amountMinor: number
  accountId: string | null
  source: string | null
  needsReview: boolean
  locked: boolean
}

const SOURCE_LABEL: Record<string, string> = { rule: "Rule", ai: "AI", human: "You", heuristic: "Auto" }

export function TransactionsTable({ rows, accounts, currency, locale }: { rows: LedgerRow[]; accounts: AccountRef[]; currency: CurrencyCode; locale: string }) {
  const { pending, run } = useServerAction()
  return (
    <Card className="py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28 pl-6">Date</TableHead>
            <TableHead>Transaction</TableHead>
            <TableHead className="w-32 text-right">Amount</TableHead>
            <TableHead className="w-80">Account</TableHead>
            <TableHead className="w-12 pr-6" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="pl-6 text-muted-foreground">{formatDate(r.date, locale, "short")}</TableCell>
              <TableCell>
                <TxnDescription description={r.description} counterparty={r.counterparty} />
              </TableCell>
              <TableCell className="text-right">
                <SignedAmount minor={r.amountMinor} currency={currency} locale={locale} />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {r.locked ? (
                    <span className="truncate text-sm">{accounts.find((a) => a.id === r.accountId)?.name ?? "—"}</span>
                  ) : (
                    <AccountSelect
                      label={`Account for ${r.counterparty || r.description}`}
                      accounts={accounts}
                      value={r.accountId}
                      sign={r.amountMinor > 0 ? "in" : "out"}
                      onChange={(accountId) => run(() => assignAccount([r.id], accountId), { success: "Saved" })}
                    />
                  )}
                  {r.needsReview ? (
                    <Badge variant="outline" className="shrink-0 border-warning/60">
                      Review
                    </Badge>
                  ) : r.source ? (
                    <Badge variant="secondary" className="shrink-0">
                      {SOURCE_LABEL[r.source]}
                    </Badge>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="pr-6">
                {!r.locked ? (
                  <Button size="icon" variant="ghost" aria-label="Delete transaction" disabled={pending} onClick={() => run(() => removeTransaction(r.id), { success: "Transaction deleted" })}>
                    <Trash2Icon />
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}
