"use client"

import { PauseIcon, PlayIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useServerAction } from "@/components/use-server-action"
import { setRecurringPaused } from "@/server/actions/invoices"

/** Pause a running series, or resume a paused/stopped one (it continues from today, never back-billing). */
export function SeriesToggle({ seriesId, running }: { seriesId: string; running: boolean }) {
  const { pending, run } = useServerAction()
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => run(() => setRecurringPaused(seriesId, running), { success: running ? "Paused" : "Resumed" })}
    >
      {running ? <PauseIcon /> : <PlayIcon />} {running ? "Pause" : "Resume"}
    </Button>
  )
}
