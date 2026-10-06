import { CalendarClockIcon, TrendingDownIcon, TrophyIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMoney, type CurrencyCode } from "@/lib/money"
import { dismissAlert } from "@/server/actions/advisory"
import { GrowthPlanButton } from "./growth-plan-button"

export type AlertView = { id: string; type: "milestone_lifetime" | "milestone_month" | "margin_low" | "tax_deadline"; payload: Record<string, unknown> }

function copy(alert: AlertView, money: (m: number) => string) {
  const p = alert.payload
  switch (alert.type) {
    case "milestone_lifetime":
      return {
        icon: TrophyIcon,
        tone: "border-primary/40 bg-primary/5",
        title: `You’ve invoiced ${money(Number(p.invoicedMinor))} — congratulations!`,
        body: "Crossing this milestone is when cash-flow planning starts paying for itself: pricing, tax reserves and hiring decisions get real. Let’s map your next stage.",
      }
    case "milestone_month":
      return {
        icon: TrophyIcon,
        tone: "border-primary/40 bg-primary/5",
        title: `${money(Number(p.invoicedMinor))} invoiced in a single month`,
        body: "A record month is the right moment to lock in a growth plan — and to make sure the tax bill on it doesn’t surprise you.",
      }
    case "margin_low":
      return {
        icon: TrendingDownIcon,
        tone: "border-destructive/40 bg-destructive/5",
        title: `Net margin dropped to ${(Number(p.marginBp) / 100).toFixed(0)} % over the last 90 days`,
        body: `Expenses are running at ${money(Number(p.expensesMinor))} against ${money(Number(p.cashInMinor))} collected. A margin under ${(Number(p.thresholdBp) / 100).toFixed(0)} % leaves little buffer — we can show you where it’s leaking.`,
      }
    case "tax_deadline":
      return {
        icon: CalendarClockIcon,
        tone: "border-warning/50 bg-warning/5",
        title: `${String(p.title)} due ${new Date(`${String(p.date)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}`,
        body: `${String(p.detail)} ${Number(p.daysLeft)} days left — plan the cash so the payment doesn’t squeeze your month.`,
      }
  }
}

export function AlertCards({ alerts, currency, locale }: { alerts: AlertView[]; currency: CurrencyCode; locale: string }) {
  const money = (m: number) => formatMoney(m, currency, locale)
  if (!alerts.length) return null


  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {alerts.map((alert) => {
        const c = copy(alert, money)
        return (
          <Card key={alert.id} className={c.tone}>
            <CardHeader>
              <CardTitle className="flex items-start gap-2 text-base leading-snug">
                <c.icon className="mt-0.5 size-5 shrink-0" /> {c.title}
              </CardTitle>
              <CardAction>
                <form action={dismissAlert.bind(null, alert.id)}>
                  <Button size="icon" variant="ghost" className="size-7" aria-label="Dismiss">
                    <XIcon />
                  </Button>
                </form>
              </CardAction>
              <CardDescription>{c.body}</CardDescription>
            </CardHeader>
            <CardFooter>
              <GrowthPlanButton alertId={alert.id} className="h-auto whitespace-normal" />
            </CardFooter>
          </Card>
        )
      })}
    </div>
  )
}
