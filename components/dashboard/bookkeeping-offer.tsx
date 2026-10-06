"use client"

import { BriefcaseBusinessIcon } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { requestBookkeeping } from "@/server/actions/advisory"

export function BookkeepingOffer({ uncategorized, status }: { uncategorized: number; status: "none" | "requested" | "active" | "paused" }) {
  const [consent, setConsent] = useState(false)
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()

  if (status === "active") {
    return (
      <Card className="border-primary/40 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BriefcaseBusinessIcon className="size-4" /> Your books are in good hands
          </CardTitle>
          <CardDescription>Our team categorizes your transactions and closes each month. Summaries appear under Books &amp; P&amp;L.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BriefcaseBusinessIcon className="size-4" /> Done-for-you bookkeeping
        </CardTitle>
        <CardDescription>
          {uncategorized > 0 ? `${uncategorized} transactions are waiting for a decision. ` : ""}
          Our AI does the routine work, our bookkeepers check every exception and close your month — with a plain-language summary.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        {status === "requested" ? (
          <p className="text-sm text-muted-foreground">Request received — we’ll be in touch within one business day.</p>
        ) : (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">Have our team keep your books</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Done-for-you bookkeeping</DialogTitle>
                <DialogDescription>
                  A named bookkeeper reviews your imports, categorizes exceptions, and closes each month with a short written summary. You keep full access and
                  can end the service at any time.
                </DialogDescription>
              </DialogHeader>
              <CardContent className="px-0">
                <label className="flex items-start gap-3 text-sm">
                  <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
                  <span>
                    I allow the assigned bookkeeper to access this workspace (transactions, invoices and settings). Every change they make is recorded in an
                    audit log.
                  </span>
                </label>
              </CardContent>
              <DialogFooter>
                <Button
                  disabled={!consent || pending}
                  onClick={() =>
                    start(async () => {
                      const result = await requestBookkeeping(consent)
                      if (!result.ok) return void toast.error(result.error)
                      toast.success("Request received — we’ll be in touch shortly.")
                      setOpen(false)
                      if (result.bookingUrl) window.open(result.bookingUrl, "_blank", "noopener")
                    })
                  }
                >
                  {pending ? <Spinner /> : null} Request bookkeeping
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardFooter>
    </Card>
  )
}
