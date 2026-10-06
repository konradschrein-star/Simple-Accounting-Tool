import { Badge } from "@/components/ui/badge"
import type { DisplayStatus } from "@/invoicing/rules"
import { cn } from "@/lib/utils"

const STYLES: Record<DisplayStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  open: { label: "Open", className: "bg-chart-2/15 text-chart-2" },
  overdue: { label: "Overdue", className: "bg-destructive/15 text-destructive" },
  paid: { label: "Paid", className: "bg-success/15 text-success" },
  void: { label: "Void", className: "bg-muted text-muted-foreground line-through" },
}

export function InvoiceStatusBadge({ status }: { status: DisplayStatus }) {
  const style = STYLES[status]
  return (
    <Badge variant="secondary" className={cn("border-transparent font-medium", style.className)}>
      {style.label}
    </Badge>
  )
}
