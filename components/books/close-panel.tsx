"use client"

import { CheckCircle2Icon, CircleIcon, LockIcon, SparklesIcon, UnlockIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import type { CloseChecklist, CloseSummary } from "@/db/schema"
import { useServerAction } from "@/components/use-server-action"
import type { ActionResult } from "@/lib/action-result"
import { closeMonth, prepareClose, reopenMonth } from "@/server/actions/books"

export function ClosePanel({
  period,
  label,
  status,
  checklist,
  summary,
  ended,
}: {
  period: string
  label: string
  status: "open" | "in_review" | "closed"
  checklist: CloseChecklist
  summary: CloseSummary | null
  ended: boolean
}) {
  const { pending, run: runAction } = useServerAction()
  const run = (fn: () => Promise<ActionResult>, success: string) => runAction(fn, { success })
  const [headline, setHeadline] = useState(summary?.headline ?? "")
  const [bullets, setBullets] = useState(summary?.bullets.join("\n") ?? "")
  const [watch, setWatch] = useState(summary?.watchItems.join("\n") ?? "")
  const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean)
  const items = [
    { ok: checklist.transactions > 0, label: `${checklist.transactions} transactions booked for ${label}` },
    { ok: checklist.needsReview === 0, label: checklist.needsReview ? `${checklist.needsReview} transactions still need review` : "Every transaction categorized" },
    { ok: checklist.pendingImports === 0, label: checklist.pendingImports ? `${checklist.pendingImports} imports not yet booked` : "All imports booked" },
    { ok: checklist.unreconciledImports === 0, label: checklist.unreconciledImports ? `${checklist.unreconciledImports} statements didn’t reconcile` : "Statements reconcile", soft: true },
  ]
  const ready = items.every((i) => i.ok || i.soft)
  const closed = status === "closed"

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Checklist</CardTitle>
          <CardDescription>{closed ? "This month is closed and locked." : ended ? "Complete these to close the month." : "The month is still running."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((i) => (
            <div key={i.label} className="flex items-start gap-2 text-sm">
              {i.ok ? <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" /> : <CircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
              <span className={i.ok ? "" : "text-muted-foreground"}>{i.label}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <SparklesIcon className="size-4" /> Month-end summary for the client
          </CardTitle>
          <CardDescription>Drafted from the numbers, polished by AI. Edit anything before closing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {summary || headline ? (
            <>
              <Input value={headline} onChange={(e) => setHeadline(e.target.value)} disabled={closed} className="font-medium" aria-label="Headline" />
              <Textarea value={bullets} onChange={(e) => setBullets(e.target.value)} rows={5} disabled={closed} aria-label="Key points (one per line)" />
              <Textarea value={watch} onChange={(e) => setWatch(e.target.value)} rows={3} disabled={closed} placeholder="Watch items (one per line)" aria-label="Watch items" />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No summary yet. Draft one to see how {label} went.</p>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap justify-end gap-2">
          {closed ? (
            <Button variant="outline" onClick={() => run(() => reopenMonth(period), `${label} reopened`)} disabled={pending}>
              <UnlockIcon /> Reopen month
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => run(() => prepareClose(period), "Summary drafted")} disabled={pending}>
                {pending ? <Spinner /> : <SparklesIcon />} {summary ? "Redraft summary" : "Draft summary"}
              </Button>
              <Button
                disabled={pending || !ready || !ended || !headline}
                onClick={() => run(() => closeMonth(period, { headline, bullets: lines(bullets), watchItems: lines(watch) }), `${label} closed`)}
              >
                <LockIcon /> Close {label}
              </Button>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
