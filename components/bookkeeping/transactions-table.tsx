"use client"

import { Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { AccountRef } from "@/bookkeeping/categorize"
import { formatDate } from "@/lib/dates"
import { formatMoney, type CurrencyCode } from "@/lib/money"
import { cn } from "@/lib/utils"
import { assignAccount, removeTransaction } from "@/server/actions/bookkeeping"
import { AccountSelect } from "./account-select"

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
  const router = useRouter()
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const result = await fn()
      if (!result.ok) toast.error(result.error)
      router.refresh()
    })

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
                <div className="max-w-md truncate font-medium">{r.counterparty || r.description}</div>
                {r.counterparty ? <div className="max-w-md truncate text-xs text-muted-foreground">{r.description}</div> : null}
              </TableCell>
              <TableCell className={cn("text-right tabular-nums", r.amountMinor > 0 && "text-success")}>{formatMoney(r.amountMinor, currency, locale)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {r.locked ? (
                    <span className="truncate text-sm">{accounts.find((a) => a.id === r.accountId)?.name ?? "—"}</span>
                  ) : (
                    <AccountSelect accounts={accounts} value={r.accountId} sign={r.amountMinor > 0 ? "in" : "out"} onChange={(accountId) => run(() => assignAccount([r.id], accountId))} />
                  )}
                  {r.needsReview ? (
                    <Badge variant="outline" className="shrink-0 border-warning/60">Review</Badge>
                  ) : r.source ? (
                    <Badge variant="secondary" className="shrink-0">{SOURCE_LABEL[r.source]}</Badge>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="pr-6">
                {!r.locked ? (
                  <Button size="icon" variant="ghost" aria-label="Delete transaction" disabled={pending} onClick={() => run(() => removeTransaction(r.id))}>
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
