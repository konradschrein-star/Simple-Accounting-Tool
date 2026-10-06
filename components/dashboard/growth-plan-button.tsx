"use client"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useServerAction } from "@/components/use-server-action"
import { requestGrowthPlan } from "@/server/actions/advisory"

/** The one CTA: records the request (with a metrics snapshot), then opens the booking page. */
export function GrowthPlanButton({ alertId = null, className = "h-auto w-full whitespace-normal py-2" }: { alertId?: string | null; className?: string }) {
  const { pending, run } = useServerAction()
  return (
    <Button
      className={className}
      disabled={pending}
      onClick={() =>
        run(() => requestGrowthPlan(alertId), {
          success: (r) => (r.alreadyRequested ? "You already have a request open — pick a time that suits you." : "Request received! Pick a time for your strategy call."),
          onSuccess: (r) => r.bookingUrl && window.open(r.bookingUrl, "_blank", "noopener"),
        })
      }
    >
      {pending ? <Spinner /> : null} Request a Strategic Cash-Flow &amp; Growth Plan
    </Button>
  )
}
