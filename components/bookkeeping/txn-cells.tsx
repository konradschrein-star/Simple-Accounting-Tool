import { formatMoney, type CurrencyCode } from "@/lib/money"
import { cn } from "@/lib/utils"

/** Payee (or description) with the description underneath — the same in every ledger table. */
export function TxnDescription({ description, counterparty }: { description: string; counterparty: string }) {
  return (
    <>
      <div className="max-w-md truncate font-medium">{counterparty || description}</div>
      {counterparty ? <div className="max-w-md truncate text-xs text-muted-foreground">{description}</div> : null}
    </>
  )
}

/** Money in is green; money out stays in the default ink. */
export function SignedAmount({ minor, currency, locale, className }: { minor: number; currency: CurrencyCode; locale: string; className?: string }) {
  return <span className={cn("tabular-nums", minor > 0 && "text-success", className)}>{formatMoney(minor, currency, locale)}</span>
}
