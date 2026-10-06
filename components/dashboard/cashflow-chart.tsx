"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { formatMoney, type CurrencyCode } from "@/lib/money"

const config = {
  cashIn: { label: "Cash in", color: "var(--chart-1)" },
  expenses: { label: "Expenses", color: "var(--chart-2)" },
} satisfies ChartConfig

export function CashflowChart({ data, currency, locale }: { data: { month: string; cashIn: number; expenses: number }[]; currency: CurrencyCode; locale: string }) {
  const compact = new Intl.NumberFormat(locale, { notation: "compact", style: "currency", currency, maximumFractionDigits: 0 })
  const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString(locale, { month: "short", timeZone: "UTC" })
  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <BarChart data={data} barGap={2} margin={{ left: 4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.5} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={monthLabel} />
        <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => compact.format(v / 100)} />
        <ChartTooltip
          cursor={{ fillOpacity: 0.08 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const month = payload?.[0]?.payload?.month as string | undefined
                return month ? new Date(`${month}-01T00:00:00Z`).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" }) : ""
              }}
              formatter={(value, name) => (
                <div className="flex w-full justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-2.5 rounded-[2px]" style={{ background: `var(--color-${name})` }} />
                    {config[name as keyof typeof config].label}
                  </span>
                  <span className="font-medium tabular-nums">{formatMoney(Number(value), currency, locale)}</span>
                </div>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="cashIn" fill="var(--color-cashIn)" radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar dataKey="expenses" fill="var(--color-expenses)" radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ChartContainer>
  )
}
