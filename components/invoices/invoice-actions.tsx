"use client"

import { BanIcon, CheckIcon, CopyIcon, DownloadIcon, Undo2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { DisplayStatus } from "@/invoicing/rules"
import { duplicate, markPaid, markUnpaid, voidInvoice } from "@/server/actions/invoices"

export function InvoiceActions({ id, status, today }: { id: string; status: DisplayStatus; today: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [paidDate, setPaidDate] = useState(today)
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    start(async () => {
      const result = await fn()
      if (!result.ok) return void toast.error(result.error)
      toast.success(success)
      router.refresh()
    })

  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline">
        <a href={`/api/invoices/${id}/pdf?download=1`}>
          <DownloadIcon /> Download PDF
        </a>
      </Button>
      {status === "open" || status === "overdue" ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button disabled={pending}>
              <CheckIcon /> Mark paid
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 space-y-3">
            <p className="text-sm font-medium">Payment received on</p>
            <Input type="date" value={paidDate} max={today} onChange={(e) => setPaidDate(e.target.value)} />
            <Button className="w-full" onClick={() => run(() => markPaid(id, paidDate), "Marked as paid")}>
              Confirm payment
            </Button>
          </PopoverContent>
        </Popover>
      ) : null}
      {status === "paid" ? (
        <Button variant="outline" disabled={pending} onClick={() => run(() => markUnpaid(id), "Marked as unpaid")}>
          <Undo2Icon /> Mark unpaid
        </Button>
      ) : null}
      <form action={duplicate.bind(null, id)}>
        <Button variant="ghost">
          <CopyIcon /> Duplicate
        </Button>
      </form>
      {status !== "void" ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" className="text-destructive">
              <BanIcon /> Void
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Void this invoice?</AlertDialogTitle>
              <AlertDialogDescription>
                The number stays reserved and the PDF is stamped VOID. This keeps your numbering gap-free for your tax records. It cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => run(() => voidInvoice(id), "Invoice voided")}>Void invoice</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  )
}
