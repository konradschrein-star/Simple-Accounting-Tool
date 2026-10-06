import { CompassIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cn("flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground", className)}>
      <CompassIcon className="size-4" />
    </div>
  )
}
