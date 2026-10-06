import {
  BanIcon,
  BellIcon,
  CheckCircle2Icon,
  CircleDotIcon,
  EyeIcon,
  FileCheck2Icon,
  MailIcon,
  RepeatIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  TriangleAlertIcon,
  Undo2Icon,
  type LucideIcon,
} from "lucide-react"
import type { InvoiceEvent } from "@/invoicing/events"
import { formatMoney, type CurrencyCode } from "@/lib/money"

export type TimelineEvent = InvoiceEvent & { id: string; at: number }

function describe(e: InvoiceEvent, money: (minor: number) => string): { icon: LucideIcon; text: string } {
  switch (e.type) {
    case "finalized":
      return { icon: FileCheck2Icon, text: `Issued as ${e.detail.number}` }
    case "sent":
      return { icon: MailIcon, text: `Emailed to ${e.detail.to}` }
    case "viewed":
      return { icon: EyeIcon, text: "Opened by the client" }
    case "payment":
      return { icon: CheckCircle2Icon, text: `${money(e.detail.amountMinor)} received${e.detail.method === "bank" ? " (bank match)" : ""}` }
    case "payment_removed":
      return { icon: Undo2Icon, text: `Payment of ${money(e.detail.amountMinor)} removed` }
    case "reminder":
      return { icon: BellIcon, text: `Payment reminder ${e.detail.level} sent${e.detail.feeMinor ? ` with ${money(e.detail.feeMinor)} late fee` : ""}` }
    case "cancelled":
      return { icon: BanIcon, text: `Cancelled by credit note ${e.detail.creditNote}` }
    case "accepted":
      return { icon: ThumbsUpIcon, text: e.detail?.by === "user" ? "Marked as accepted" : "Accepted by the client" }
    case "declined":
      return { icon: ThumbsDownIcon, text: e.detail?.by === "user" ? "Marked as declined" : "Declined by the client" }
    case "converted":
      return { icon: FileCheck2Icon, text: "Turned into an invoice" }
    case "generated":
      return { icon: RepeatIcon, text: "Created by a recurring schedule" }
    case "send_failed":
      return { icon: TriangleAlertIcon, text: `Sending failed: ${e.detail.error}` }
    default:
      // Rows written before the event types were fixed.
      return { icon: CircleDotIcon, text: String((e as { type: string }).type).replace(/_/g, " ") }
  }
}

export function DocumentTimeline({
  events,
  currency,
  locale,
  timeZone,
}: {
  events: TimelineEvent[]
  currency: CurrencyCode
  locale: string
  timeZone: string
}) {
  if (!events.length) return <p className="text-sm text-muted-foreground">Nothing has happened yet.</p>
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone })
  const money = (minor: number) => formatMoney(minor, currency, locale)
  return (
    <ol className="relative space-y-4 border-l pl-5">
      {events.map((e) => {
        const { icon: Icon, text } = describe(e, money)
        return (
          <li key={e.id} className="relative">
            <span className="absolute top-0.5 -left-[1.95rem] flex size-5 items-center justify-center rounded-full border bg-background">
              <Icon className="size-3 text-muted-foreground" />
            </span>
            <p className="text-sm">{text}</p>
            <time className="text-xs text-muted-foreground">{when.format(e.at)}</time>
          </li>
        )
      })}
    </ol>
  )
}
