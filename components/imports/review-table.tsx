"use client"

import { CheckCircle2Icon, CircleAlertIcon, LinkIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Reconciliation, RowIssue } from "@/db/schema"
import { formatMoney, minorToInput, parseAmountInput, type CurrencyCode } from "@/lib/money"
import { cn } from "@/lib/utils"
import { commitImport, saveImportEdits } from "@/server/actions/imports"

export type ReviewRow = {
  id: string
  date: string | null
  description: string
  counterparty: string
  amountMinor: number | null
  issues: RowIssue[]
  include: boolean
  matchedInvoice: { id: string; number: string | null } | null
}

const ISSUE_LABELS: Record<RowIssue, string> = {
  unparseable_date: "Date unreadable",
  unparseable_amount: "Amount unreadable",
  balance_mismatch: "Balance doesn’t add up",
  possible_duplicate: "Already booked",
  low_confidence: "Not found in PDF text",
  out_of_period: "Outside statement period",
  foreign_currency: "Other currency",
}

export function ReviewTable({
  batchId,
  rows: initial,
  reconciliation,
  currency,
  locale,
}: {
  batchId: string
  rows: ReviewRow[]
  reconciliation: Reconciliation | null
  currency: CurrencyCode
  locale: string
}) {
  const router = useRouter()
  const [rows, setRows] = useState(initial)
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [committing, startCommit] = useTransition()
  const money = (minor: number) => formatMoney(minor, currency, locale)
  const visible = flaggedOnly ? rows.filter((r) => r.issues.length) : rows
  const included = rows.filter((r) => r.include && r.date && r.amountMinor !== null)
  const totals = {
    in: included.reduce((s, r) => s + Math.max(0, r.amountMinor!), 0),
    out: included.reduce((s, r) => s + Math.min(0, r.amountMinor!), 0),
  }

  /** Optimistic edit; rolled back if the server refuses it. */
  async function update(id: string, patch: Partial<ReviewRow>, persist: Record<string, unknown>) {
    const before = rows.find((r) => r.id === id)
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    const result = await saveImportEdits(batchId, [{ id, ...persist }])
    if (!result.ok) {
      toast.error(result.error)
      if (before) setRows((rs) => rs.map((r) => (r.id === id ? before : r)))
    }
  }

  function commit() {
    startCommit(async () => {
      const result = await commitImport(batchId)
      if (!result.ok) return void toast.error(result.error)
      toast.success(result.message ?? "Booked")
      router.push("/review")
    })
  }

  return (
    <div className="space-y-4">
      {reconciliation?.ok === true ? (
        <Alert className="border-success/40 bg-success/5">
          <CheckCircle2Icon className="text-success" />
          <AlertTitle>Statement reconciles</AlertTitle>
          <AlertDescription>
            Opening {money(reconciliation.openingMinor!)} + movements {money(reconciliation.computedDeltaMinor)} = closing {money(reconciliation.closingMinor!)}
            . Every line is accounted for.
          </AlertDescription>
        </Alert>
      ) : reconciliation?.ok === false ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Balances don’t reconcile yet</AlertTitle>
          <AlertDescription>
            Opening {money(reconciliation.openingMinor!)} + movements {money(reconciliation.computedDeltaMinor)} ≠ closing {money(reconciliation.closingMinor!)}{" "}
            (difference {money(reconciliation.closingMinor! - reconciliation.openingMinor! - reconciliation.computedDeltaMinor)}). Check the flagged rows before
            booking.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={flaggedOnly} onCheckedChange={setFlaggedOnly} /> Show flagged only ({rows.filter((r) => r.issues.length).length})
        </label>
        <div className="ml-auto flex gap-4 text-sm tabular-nums">
          <span className="text-success">In {money(totals.in)}</span>
          <span>Out {money(totals.out)}</span>
        </div>
      </div>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 pl-4">
                <span className="sr-only">Include</span>
              </TableHead>
              <TableHead className="w-36">Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-36 text-right">Amount</TableHead>
              <TableHead className="w-56">Checks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r) => (
              <TableRow key={r.id} className={cn(!r.include && "opacity-50")}>
                <TableCell className="pl-4">
                  <Checkbox
                    checked={r.include}
                    aria-label="Include row"
                    onCheckedChange={(v) => update(r.id, { include: v === true }, { include: v === true })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="date"
                    aria-label="Booking date"
                    defaultValue={r.date ?? ""}
                    className="h-8"
                    onBlur={(e) =>
                      e.target.value &&
                      e.target.value !== r.date &&
                      update(r.id, { date: e.target.value, issues: r.issues.filter((i) => i !== "unparseable_date") }, { date: e.target.value })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    aria-label="Description"
                    defaultValue={r.description}
                    className="h-8"
                    onBlur={(e) => e.target.value !== r.description && update(r.id, { description: e.target.value }, { description: e.target.value })}
                  />
                  {r.counterparty && r.counterparty !== r.description ? <p className="mt-1 truncate text-xs text-muted-foreground">{r.counterparty}</p> : null}
                </TableCell>
                <TableCell>
                  <Input
                    aria-label="Amount"
                    defaultValue={r.amountMinor === null ? "" : minorToInput(r.amountMinor)}
                    inputMode="decimal"
                    className={cn("h-8 text-right tabular-nums", (r.amountMinor ?? 0) > 0 && "text-success")}
                    onBlur={(e) => {
                      const value = parseAmountInput(e.target.value)
                      if (value !== null && value !== r.amountMinor)
                        update(r.id, { amountMinor: value, issues: r.issues.filter((i) => i !== "unparseable_amount") }, { amountMinor: value })
                    }}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {r.issues.map((issue) => (
                      <Badge
                        key={issue}
                        variant="outline"
                        className={issue === "possible_duplicate" ? "text-muted-foreground" : "border-warning/50 text-foreground"}
                      >
                        {ISSUE_LABELS[issue]}
                      </Badge>
                    ))}
                    {r.matchedInvoice ? (
                      <Badge className="gap-1 bg-success/15 text-success">
                        <LinkIcon className="size-3" /> Pays {r.matchedInvoice.number}
                        <button aria-label="Remove invoice match" onClick={() => update(r.id, { matchedInvoice: null }, { matchedInvoiceId: null })}>
                          <XIcon className="size-3" />
                        </button>
                      </Badge>
                    ) : null}
                    {!r.issues.length && !r.matchedInvoice ? <CheckCircle2Icon className="size-4 text-success" aria-label="OK" /> : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <span className="text-sm text-muted-foreground">
          {included.length} of {rows.length} lines will be booked
        </span>
        <Button size="lg" onClick={commit} disabled={committing || !included.length}>
          {committing ? <Spinner /> : null} Book {included.length} transactions
        </Button>
      </div>
    </div>
  )
}
