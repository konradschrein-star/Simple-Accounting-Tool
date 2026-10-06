import type { Pnl, PnlLine } from "@/bookkeeping/pnl"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatMoney, type CurrencyCode } from "@/lib/money"
import { cn } from "@/lib/utils"

export function PnlTable({ pnl, currency, locale }: { pnl: Pnl; currency: CurrencyCode; locale: string }) {
  const money = (m: number) => formatMoney(m, currency, locale)
  const change = (cur: number, prior: number) => {
    if (!prior) return "—"
    const pct = Math.round(((cur - prior) / Math.abs(prior)) * 100)
    return `${pct > 0 ? "+" : ""}${pct} %`
  }
  const section = (title: string, lines: PnlLine[], total: number, priorTotal: number) => (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableCell colSpan={5} className="pl-6 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
        </TableCell>
      </TableRow>
      {lines.map((l) => (
        <TableRow key={`${title}-${l.code}-${l.name}`}>
          <TableCell className="pl-6 text-muted-foreground tabular-nums">{l.code}</TableCell>
          <TableCell>
            {l.name}
            {l.taxLine ? <div className="text-xs text-muted-foreground">{l.taxLine}</div> : null}
          </TableCell>
          <TableCell className="text-right tabular-nums">{money(l.amountMinor)}</TableCell>
          <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">{money(l.priorMinor)}</TableCell>
          <TableCell className="hidden pr-6 text-right text-muted-foreground tabular-nums sm:table-cell">{change(l.amountMinor, l.priorMinor)}</TableCell>
        </TableRow>
      ))}
      <TableRow className="font-medium">
        <TableCell className="pl-6" />
        <TableCell>Total {title.toLowerCase()}</TableCell>
        <TableCell className="text-right tabular-nums">{money(total)}</TableCell>
        <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">{money(priorTotal)}</TableCell>
        <TableCell className="hidden pr-6 text-right text-muted-foreground tabular-nums sm:table-cell">{change(total, priorTotal)}</TableCell>
      </TableRow>
    </>
  )
  return (
    <Card className="py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20 pl-6">Code</TableHead>
            <TableHead>Account</TableHead>
            <TableHead className="text-right">This period</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Prior period</TableHead>
            <TableHead className="hidden pr-6 text-right sm:table-cell">Change</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {section("Income", pnl.income, pnl.incomeMinor, pnl.priorIncomeMinor)}
          {section("Expenses", pnl.expenses, pnl.expensesMinor, pnl.priorExpensesMinor)}
          <TableRow className="border-t-2 text-base font-semibold hover:bg-transparent">
            <TableCell className="pl-6" />
            <TableCell>Net result</TableCell>
            <TableCell className={cn("text-right tabular-nums", pnl.netMinor < 0 && "text-destructive")}>{money(pnl.netMinor)}</TableCell>
            <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">{money(pnl.priorNetMinor)}</TableCell>
            <TableCell className="hidden pr-6 text-right text-muted-foreground tabular-nums sm:table-cell">{change(pnl.netMinor, pnl.priorNetMinor)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Card>
  )
}
