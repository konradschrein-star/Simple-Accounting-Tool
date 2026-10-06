import { Badge } from "@/components/ui/badge"
import type { DisplayStatus } from "@/invoicing/documents"
import { cn } from "@/lib/utils"

const STYLES: Record<DisplayStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  open: { label: "Open", className: "bg-chart-2/15 text-chart-2" },
  partial: { label: "Part-paid", className: "bg-chart-2/15 text-chart-2" },
  overdue: { label: "Overdue", className: "bg-destructive/15 text-destructive" },
  paid: { label: "Paid", className: "bg-success/15 text-success" },
  void: { label: "Void", className: "bg-muted text-muted-foreground line-through" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground line-through" },
  sent: { label: "Sent", className: "bg-chart-2/15 text-chart-2" },
  accepted: { label: "Accepted", className: "bg-success/15 text-success" },
  declined: { label: "Declined", className: "bg-destructive/15 text-destructive" },
  converted: { label: "Invoiced", className: "bg-primary/15 text-primary" },
  expired: { label: "Expired", className: "bg-warning/20 text-foreground" },
  issued: { label: "Issued", className: "bg-chart-2/15 text-chart-2" },
}

export function InvoiceStatusBadge({ status }: { status: DisplayStatus }) {
  const style = STYLES[status]
  return (
    <Badge variant="secondary" className={cn("border-transparent font-medium", style.className)}>
      {style.label}
    </Badge>
  )
}
