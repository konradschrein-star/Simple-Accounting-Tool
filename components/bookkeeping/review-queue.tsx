"use client"

import { CheckIcon, SparklesIcon, WandSparklesIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Kbd } from "@/components/ui/kbd"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { AccountRef } from "@/bookkeeping/categorize"
import { formatDate } from "@/lib/dates"
import { formatMoney, type CurrencyCode } from "@/lib/money"
import { cn } from "@/lib/utils"
import { acceptSuggestions, assignAccount, createRuleFromTransaction, rerunCategorization, type BookkeepingResult } from "@/server/actions/bookkeeping"
import { AccountSelect } from "./account-select"

export type QueueRow = {
  id: string
  date: string
  description: string
  counterparty: string
  amountMinor: number
  suggestedAccountId: string | null
  confidenceBp: number | null
}

export function ReviewQueue({ rows, accounts, currency, locale }: { rows: QueueRow[]; accounts: AccountRef[]; currency: CurrencyCode; locale: string }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [cursor, setCursor] = useState(0)
  const [pending, start] = useTransition()
  const withSuggestion = rows.filter((r) => r.suggestedAccountId)

  function handle(result: BookkeepingResult) {
    if (!result.ok) return void toast.error(result.error)
    if (result.message) toast.success(result.message)
    if (result.suggestRuleFor) {
      const id = result.suggestRuleFor
      toast("Categorized", {
        description: "Always categorize this payee the same way?",
        action: { label: "Create rule", onClick: () => start(async () => handle(await createRuleFromTransaction(id))) },
      })
    }
    setSelected(new Set())
    router.refresh()
  }

  const assign = (ids: string[], accountId: string) => start(async () => handle(await assignAccount(ids, accountId)))
  const accept = (ids: string[]) => start(async () => handle(await acceptSuggestions(ids)))

  // j/k to move, Enter to accept the highlighted suggestion.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [role=combobox], [role=listbox]")) return
      if (e.key === "j") setCursor((c) => Math.min(rows.length - 1, c + 1))
      if (e.key === "k") setCursor((c) => Math.max(0, c - 1))
      if (e.key === "Enter" && rows[cursor]?.suggestedAccountId) accept([rows[cursor].id])
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const toggle = (id: string) => setSelected((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {withSuggestion.length ? (
          <Button onClick={() => accept(withSuggestion.map((r) => r.id))} disabled={pending}>
            <SparklesIcon /> Accept all {withSuggestion.length} AI suggestions
          </Button>
        ) : null}
        <Button variant="outline" onClick={() => start(async () => handle(await rerunCategorization()))} disabled={pending}>
          {pending ? <Spinner /> : <WandSparklesIcon />} Re-run auto-categorization
        </Button>
        {selected.size ? (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-1">
            <span className="text-sm">{selected.size} selected →</span>
            <AccountSelect accounts={accounts} value={null} onChange={(accountId) => assign([...selected], accountId)} placeholder="Assign account" className="w-64" />
          </div>
        ) : null}
        <span className="ml-auto hidden items-center gap-1 text-xs text-muted-foreground md:flex">
          <Kbd>j</Kbd>/<Kbd>k</Kbd> move · <Kbd>Enter</Kbd> accept suggestion
        </span>
      </div>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 pl-4">
                <Checkbox
                  aria-label="Select all"
                  checked={selected.size > 0 && selected.size === rows.length}
                  onCheckedChange={(v) => setSelected(v ? new Set(rows.map((r) => r.id)) : new Set())}
                />
              </TableHead>
              <TableHead className="w-28">Date</TableHead>
              <TableHead>Transaction</TableHead>
              <TableHead className="w-32 text-right">Amount</TableHead>
              <TableHead className="w-80">Account</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.id} className={cn(i === cursor && "bg-primary/5")} onClick={() => setCursor(i)}>
                <TableCell className="pl-4">
                  <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label="Select row" />
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(r.date, locale, "short")}</TableCell>
                <TableCell>
                  <div className="max-w-md truncate font-medium">{r.counterparty || r.description}</div>
                  {r.counterparty ? <div className="max-w-md truncate text-xs text-muted-foreground">{r.description}</div> : null}
                </TableCell>
                <TableCell className={cn("text-right tabular-nums", r.amountMinor > 0 && "text-success")}>{formatMoney(r.amountMinor, currency, locale)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <AccountSelect accounts={accounts} value={r.suggestedAccountId} sign={r.amountMinor > 0 ? "in" : "out"} onChange={(accountId) => assign([r.id], accountId)} />
                    {r.confidenceBp !== null && r.suggestedAccountId ? (
                      <Badge variant="outline" className="shrink-0 gap-1 tabular-nums" title="AI confidence">
                        <SparklesIcon className="size-3" /> {Math.round(r.confidenceBp / 100)}%
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  {r.suggestedAccountId ? (
                    <Button size="icon" variant="ghost" aria-label="Accept suggestion" onClick={() => accept([r.id])} disabled={pending}>
                      <CheckIcon />
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
