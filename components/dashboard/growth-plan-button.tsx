"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { requestGrowthPlan } from "@/server/actions/advisory"

export const CTA_LABEL = "Request a Strategic Cash-Flow & Growth Plan"

/** The one CTA flow: record the request (with metrics snapshot), then open the booking page. */
export function useGrowthPlanRequest() {
  const [pending, start] = useTransition()
  const request = (alertId: string | null) =>
    start(async () => {
      const result = await requestGrowthPlan(alertId)
      if (!result.ok) return void toast.error(result.error)
      toast.success(result.alreadyRequested ? "You already have a request open — pick a time that suits you." : "Request received! Pick a time for your strategy call.")
      if (result.bookingUrl) window.open(result.bookingUrl, "_blank", "noopener")
    })
  return { pending, request }
}

export function GrowthPlanButton({ alertId = null, className }: { alertId?: string | null; className?: string }) {
  const { pending, request } = useGrowthPlanRequest()
  return (
    <Button className={className ?? "h-auto w-full whitespace-normal py-2"} disabled={pending} onClick={() => request(alertId)}>
      {pending ? <Spinner /> : null} {CTA_LABEL}
    </Button>
  )
}
