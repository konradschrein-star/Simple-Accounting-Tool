"use client"

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { AccountRef } from "@/bookkeeping/categorize"
import { cn } from "@/lib/utils"

const KIND_LABELS: Record<AccountRef["kind"], string> = {
  income: "Income",
  expense: "Expenses",
  tax: "Tax payments",
  transfer: "Transfers",
  owner: "Owner / private",
}

export function AccountSelect({
  accounts,
  value,
  onChange,
  placeholder = "Choose account",
  className,
  sign,
}: {
  accounts: AccountRef[]
  value: string | null
  onChange: (accountId: string) => void
  placeholder?: string
  className?: string
  /** Puts the most likely account kinds first for money in vs. money out. */
  sign?: "in" | "out"
}) {
  const order: AccountRef["kind"][] = sign === "in" ? ["income", "owner", "transfer", "expense", "tax"] : ["expense", "tax", "owner", "transfer", "income"]
  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger className={cn("h-8 w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {order.map((kind) => {
          const group = accounts.filter((a) => a.kind === kind)
          return group.length ? (
            <SelectGroup key={kind}>
              <SelectLabel>{KIND_LABELS[kind]}</SelectLabel>
              {group.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="text-muted-foreground tabular-nums">{a.code}</span> {a.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : null
        })}
      </SelectContent>
    </Select>
  )
}
