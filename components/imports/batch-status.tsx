import { Badge } from "@/components/ui/badge"
import type { ImportBatch } from "@/server/repos/imports"
import { cn } from "@/lib/utils"

const STYLES: Record<ImportBatch["status"], { label: string; className: string }> = {
  uploaded: { label: "Uploaded", className: "bg-muted text-muted-foreground" },
  parsing: { label: "Reading…", className: "bg-chart-2/15 text-chart-2" },
  needs_mapping: { label: "Map columns", className: "bg-warning/20 text-foreground" },
  staged: { label: "Ready to review", className: "bg-chart-2/15 text-chart-2" },
  committed: { label: "Booked", className: "bg-success/15 text-success" },
  failed: { label: "Failed", className: "bg-destructive/15 text-destructive" },
}

export function BatchStatusBadge({ status }: { status: ImportBatch["status"] }) {
  return (
    <Badge variant="secondary" className={cn("border-transparent", STYLES[status].className)}>
      {STYLES[status].label}
    </Badge>
  )
}
