import { Badge } from "@/components/ui/badge"
import { STATUS_LABELS, type DisplayStatus } from "@/invoicing/documents"
import { cn } from "@/lib/utils"

const STYLES: Record<DisplayStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  open: "bg-chart-2/15 text-chart-2",
  partial: "bg-chart-2/15 text-chart-2",
  overdue: "bg-destructive/15 text-destructive",
  paid: "bg-success/15 text-success",
  cancelled: "bg-muted text-muted-foreground line-through",
  sent: "bg-chart-2/15 text-chart-2",
  accepted: "bg-success/15 text-success",
  declined: "bg-destructive/15 text-destructive",
  converted: "bg-primary/15 text-primary",
  expired: "bg-warning/20 text-foreground",
  issued: "bg-chart-2/15 text-chart-2",
}

export function InvoiceStatusBadge({ status }: { status: DisplayStatus }) {
  return (
    <Badge variant="secondary" className={cn("border-transparent font-medium", STYLES[status])}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}
