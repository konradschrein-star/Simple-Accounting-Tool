"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { normalizeRows } from "@/ingest/csv/normalize"
import type { CsvMapping } from "@/ingest/csv/types"
import type { CsvRole } from "@/jurisdictions/types"
import { formatMoney, type CurrencyCode } from "@/lib/money"
import { saveCsvMapping } from "@/server/actions/imports"

const ROLE_LABELS: Record<CsvRole | "ignore", string> = {
  ignore: "Ignore",
  date: "Date",
  description: "Description",
  counterparty: "Payee / payer",
  amount: "Amount (signed)",
  debit: "Money out",
  credit: "Money in",
  balance: "Balance",
  indicator: "Debit/credit flag",
  currency: "Currency",
}

export function MappingEditor({
  batchId,
  header,
  rows,
  initial,
  dateFormatAmbiguous,
  currency,
  locale,
}: {
  batchId: string
  header: string[]
  rows: string[][]
  initial: CsvMapping
  dateFormatAmbiguous: boolean
  currency: CurrencyCode
  locale: string
}) {
  const router = useRouter()
  const [mapping, setMapping] = useState<CsvMapping>(initial)
  const [pending, start] = useTransition()
  const roleOf = (col: number) => (Object.entries(mapping.columns).find(([, c]) => c === col)?.[0] as CsvRole | undefined) ?? "ignore"

  function assign(col: number, role: CsvRole | "ignore") {
    setMapping((m) => {
      const columns = Object.fromEntries(Object.entries(m.columns).filter(([r, c]) => c !== col && r !== role)) as CsvMapping["columns"]
      if (role !== "ignore") columns[role] = col
      const amountMode =
        columns.debit !== undefined || columns.credit !== undefined
          ? "debitCredit"
          : columns.indicator !== undefined && m.amountMode === "indicator"
            ? "indicator"
            : "signed"
      return { ...m, columns, amountMode }
    })
  }

  const preview = useMemo(() => normalizeRows(rows, mapping).slice(0, 10), [rows, mapping])
  const failures = preview.filter((r) => r.issues.length).length

  function save() {
    start(async () => {
      const result = await saveCsvMapping(batchId, mapping)
      if (!result.ok) return void toast.error(result.error)
      toast.success("Mapping saved — we'll remember it for this bank")
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Which column is which?</CardTitle>
          <CardDescription>We guessed from the headers and the data. Adjust anything that looks off — the preview updates live.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {header.map((name, col) => (
              <Field key={col}>
                <FieldLabel className="truncate text-xs text-muted-foreground">
                  {name || `Column ${col + 1}`} <span className="font-normal">· e.g. “{rows[mapping.headerRow + 1]?.[col]?.slice(0, 24) ?? ""}”</span>
                </FieldLabel>
                <Select value={roleOf(col)} onValueChange={(v) => assign(col, v as CsvRole | "ignore")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([role, label]) => (
                      <SelectItem key={role} value={role}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-4 border-t pt-4">
            <Field className="w-48">
              <FieldLabel>Date format</FieldLabel>
              <Select value={mapping.dateFormat} onValueChange={(v) => setMapping((m) => ({ ...m, dateFormat: v as CsvMapping["dateFormat"] }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dmy">Day / Month / Year</SelectItem>
                  <SelectItem value="mdy">Month / Day / Year</SelectItem>
                  <SelectItem value="ymd">Year-Month-Day</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field className="w-48">
              <FieldLabel>Decimal separator</FieldLabel>
              <Select value={mapping.decimal} onValueChange={(v) => setMapping((m) => ({ ...m, decimal: v as "." | "," }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=",">Comma (1.234,56)</SelectItem>
                  <SelectItem value=".">Dot (1,234.56)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field orientation="horizontal" className="w-auto">
              <Switch id="flip" checked={mapping.flipSign} onCheckedChange={(flipSign) => setMapping((m) => ({ ...m, flipSign }))} />
              <FieldLabel htmlFor="flip">Flip signs (bank exports spending as positive)</FieldLabel>
            </Field>
          </div>
          {dateFormatAmbiguous ? (
            <Alert>
              <AlertDescription>All dates in this file could be read either way (e.g. 03/04). Please confirm the date format above.</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card className="py-0">
        <CardHeader className="pt-6">
          <CardTitle className="flex items-center gap-2 text-base">
            Preview{" "}
            {failures ? <Badge variant="destructive">{failures} rows can’t be read</Badge> : <Badge className="bg-success/15 text-success">Looks good</Badge>}
          </CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Payee / payer</TableHead>
              <TableHead className="pr-6 text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.map((r) => (
              <TableRow key={r.rowIndex}>
                <TableCell className={r.date ? "pl-6" : "pl-6 text-destructive"}>{r.date ?? "?"}</TableCell>
                <TableCell className="max-w-72 truncate">{r.description}</TableCell>
                <TableCell className="max-w-48 truncate text-muted-foreground">{r.counterparty}</TableCell>
                <TableCell className={`pr-6 text-right tabular-nums ${r.amountMinor === null ? "text-destructive" : r.amountMinor < 0 ? "" : "text-success"}`}>
                  {r.amountMinor === null ? "?" : formatMoney(r.amountMinor, currency, locale)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <div className="flex justify-end">
        <Button size="lg" onClick={save} disabled={pending}>
          {pending ? <Spinner /> : null} Use this mapping
        </Button>
      </div>
    </div>
  )
}
