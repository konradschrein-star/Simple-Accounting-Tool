"use client"

import { useTransition } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/** A select that persists through a bound server action on change. */
export function InlineSelect({
  label,
  value,
  options,
  action,
  placeholder,
  className = "h-8 w-36",
}: {
  /** Accessible name (the select has no visible label in table cells). */
  label: string
  value: string | null
  options: { value: string; label: string }[]
  action: (value: string) => Promise<void>
  placeholder?: string
  className?: string
}) {
  const [pending, start] = useTransition()
  return (
    <Select value={value ?? undefined} onValueChange={(v) => start(() => action(v))} disabled={pending}>
      <SelectTrigger aria-label={label} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
