"use client"

import { ThumbsDownIcon, ThumbsUpIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useServerAction } from "@/components/use-server-action"
import { respondToQuote } from "@/server/actions/public"

export function QuoteResponse({ token }: { token: string }) {
  const { pending, run } = useServerAction()
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button size="lg" disabled={pending} onClick={() => run(() => respondToQuote(token, "accepted"))}>
        <ThumbsUpIcon /> Accept
      </Button>
      <Button size="lg" variant="outline" disabled={pending} onClick={() => run(() => respondToQuote(token, "declined"))}>
        <ThumbsDownIcon /> Decline
      </Button>
    </div>
  )
}
