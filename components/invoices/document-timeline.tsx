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
import { formatMoney, type CurrencyCode } from "@/lib/money"

type TimelineEvent = { id: string; type: string; detail: Record<string, unknown> | null; at: number }

const str = (v: unknown) => (typeof v === "string" ? v : "")
const num = (v: unknown) => (typeof v === "number" ? v : 0)

function describe(e: TimelineEvent, currency: CurrencyCode, locale: string): { icon: LucideIcon; text: string } {
  const d = e.detail ?? {}
  switch (e.type) {
    case "finalized":
      return { icon: FileCheck2Icon, text: `Finalized as ${str(d.number)}` }
    case "sent":
      return { icon: MailIcon, text: d.to ? `Emailed to ${str(d.to)}` : "Sent" }
    case "viewed":
      return { icon: EyeIcon, text: "Opened by the client" }
    case "payment":
      return { icon: CheckCircle2Icon, text: `${formatMoney(num(d.amountMinor), currency, locale)} received${d.method === "bank" ? " (bank match)" : ""}` }
    case "payments_cleared":
      return { icon: Undo2Icon, text: "Payments removed" }
    case "reminder":
      return {
        icon: BellIcon,
        text: `Payment reminder ${num(d.level)} sent${num(d.feeMinor) ? ` with ${formatMoney(num(d.feeMinor), currency, locale)} late fee` : ""}`,
      }
    case "cancelled":
      return { icon: BanIcon, text: `Cancelled by credit note ${str(d.creditNote)}` }
    case "accepted":
      return { icon: ThumbsUpIcon, text: "Accepted by the client" }
    case "declined":
      return { icon: ThumbsDownIcon, text: "Declined by the client" }
    case "converted":
      return { icon: FileCheck2Icon, text: "Converted to an invoice" }
    case "generated":
      return { icon: RepeatIcon, text: "Created by a recurring schedule" }
    case "send_failed":
      return { icon: TriangleAlertIcon, text: `Sending failed: ${str(d.error)}` }
    default:
      return { icon: CircleDotIcon, text: e.type.replace(/_/g, " ") }
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
  return (
    <ol className="relative space-y-4 border-l pl-5">
      {events.map((e) => {
        const { icon: Icon, text } = describe(e, currency, locale)
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
