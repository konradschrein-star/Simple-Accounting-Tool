"use client"

import { BanIcon, CheckIcon, CopyIcon, DownloadIcon, Undo2Icon } from "lucide-react"
import { useState } from "react"
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
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useServerAction } from "@/components/use-server-action"
import type { DisplayStatus } from "@/invoicing/rules"
import { changeInvoiceStatus, duplicate } from "@/server/actions/invoices"

export function InvoiceActions({ id, status, today }: { id: string; status: DisplayStatus; today: string }) {
  const { pending, run } = useServerAction()
  const [paidDate, setPaidDate] = useState(today)

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
            <Field>
              <FieldLabel htmlFor="paid-date">Payment received on</FieldLabel>
              <Input id="paid-date" type="date" value={paidDate} max={today} onChange={(e) => setPaidDate(e.target.value)} />
            </Field>
            <Button className="w-full" onClick={() => run(() => changeInvoiceStatus(id, { to: "paid", paidDate }), { success: "Marked as paid" })}>
              Confirm payment
            </Button>
          </PopoverContent>
        </Popover>
      ) : null}
      {status === "paid" ? (
        <Button variant="outline" disabled={pending} onClick={() => run(() => changeInvoiceStatus(id, { to: "finalized" }), { success: "Marked as unpaid" })}>
          <Undo2Icon /> Mark unpaid
        </Button>
      ) : null}
      <Button variant="ghost" disabled={pending} onClick={() => run(() => duplicate(id))}>
        <CopyIcon /> Duplicate
      </Button>
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
              <AlertDialogAction onClick={() => run(() => changeInvoiceStatus(id, { to: "void" }), { success: "Invoice voided" })}>Void invoice</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  )
}
