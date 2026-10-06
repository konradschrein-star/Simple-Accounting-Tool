"use client"

import {
  BanIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  FileCode2Icon,
  LinkIcon,
  MailIcon,
  MoreHorizontalIcon,
  ReceiptIcon,
  RepeatIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Undo2Icon,
} from "lucide-react"
import { useState } from "react"
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
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { useServerAction } from "@/components/use-server-action"
import type { DisplayStatus, DocumentKind } from "@/invoicing/documents"
import { minorToInput, parseAmountInput } from "@/lib/money"
import {
  addPayment,
  cancelWithCreditNote,
  convertToInvoice,
  duplicate,
  makeRecurring,
  quoteOutcome,
  sendByEmail,
  undoPayments,
} from "@/server/actions/invoices"

type Props = {
  id: string
  kind: DocumentKind
  status: DisplayStatus
  today: string
  openMinor: number
  clientEmail: string
  publicUrl: string | null
  emailEnabled: boolean
  /** Blockers per e-invoice format (empty = ready); null when e-invoicing doesn't apply. */
  eInvoice: { zugferd: string[]; xrechnung: string[] } | null
}

const E_INVOICE_FORMATS = [
  { format: "zugferd", label: "ZUGFeRD PDF (e-invoice)" },
  { format: "xrechnung", label: "XRechnung XML" },
] as const

type DialogName = "send" | "payment" | "recurring" | "cancel" | null

export function InvoiceActions(props: Props) {
  const { id, kind, status, today } = props
  const { pending, run } = useServerAction()
  const [open, setOpen] = useState<DialogName>(null)
  const [to, setTo] = useState(props.clientEmail)
  const [paidDate, setPaidDate] = useState(today)
  const [amount, setAmount] = useState(minorToInput(props.openMinor))
  const [frequency, setFrequency] = useState("monthly")
  const [startDate, setStartDate] = useState(today)
  const [count, setCount] = useState("")
  const [autoSend, setAutoSend] = useState(false)
  const close = () => setOpen(null)

  const payable = kind === "invoice" && (status === "open" || status === "overdue" || status === "partial")
  const sendable = status !== "cancelled" && status !== "converted"
  const copyLink = async () => {
    if (!props.publicUrl) return
    await navigator.clipboard.writeText(props.publicUrl)
    toast.success("Link copied — anyone with it can view this document")
  }

  return (
    <div className="flex flex-wrap gap-2">
      {sendable ? (
        props.emailEnabled ? (
          <Button onClick={() => setOpen("send")} disabled={pending}>
            <MailIcon /> Send
          </Button>
        ) : (
          <Button onClick={copyLink} disabled={!props.publicUrl}>
            <LinkIcon /> Copy link
          </Button>
        )
      ) : null}
      {payable ? (
        <Button variant="outline" onClick={() => setOpen("payment")} disabled={pending}>
          <CheckIcon /> Record payment
        </Button>
      ) : null}
      {kind === "quote" && (status === "sent" || status === "accepted" || status === "expired") ? (
        <Button variant="outline" onClick={() => run(() => convertToInvoice(id))} disabled={pending}>
          <ReceiptIcon /> Convert to invoice
        </Button>
      ) : null}
      <Button asChild variant="outline">
        <a href={`/api/invoices/${id}/pdf?download=1`}>
          <DownloadIcon /> PDF
        </a>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="More actions">
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {props.publicUrl && props.emailEnabled ? (
            <DropdownMenuItem onSelect={copyLink}>
              <LinkIcon /> Copy share link
            </DropdownMenuItem>
          ) : null}
          {props.eInvoice
            ? E_INVOICE_FORMATS.map(({ format, label }) => {
                const problems = props.eInvoice![format]
                return problems.length ? (
                  <DropdownMenuItem key={format} onSelect={() => toast.error(`${label} needs a few details`, { description: problems.join(" ") })}>
                    <FileCode2Icon /> {label}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem key={format} asChild>
                    <a href={`/api/invoices/${id}/einvoice?format=${format}`}>
                      <FileCode2Icon /> {label}
                    </a>
                  </DropdownMenuItem>
                )
              })
            : null}
          {kind === "quote" && status === "sent" ? (
            <>
              <DropdownMenuItem onSelect={() => run(() => quoteOutcome(id, "accepted"), { success: "Marked as accepted" })}>
                <ThumbsUpIcon /> Mark accepted
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => run(() => quoteOutcome(id, "declined"), { success: "Marked as declined" })}>
                <ThumbsDownIcon /> Mark declined
              </DropdownMenuItem>
            </>
          ) : null}
          {kind === "invoice" && status !== "cancelled" ? (
            <DropdownMenuItem onSelect={() => setOpen("recurring")}>
              <RepeatIcon /> Make recurring
            </DropdownMenuItem>
          ) : null}
          {kind === "invoice" && status === "paid" ? (
            <DropdownMenuItem onSelect={() => run(() => undoPayments(id), { success: "Payments removed" })}>
              <Undo2Icon /> Undo payments
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => run(() => duplicate(id))}>
            <CopyIcon /> Duplicate
          </DropdownMenuItem>
          {kind === "invoice" && status !== "cancelled" ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onSelect={() => setOpen("cancel")}>
                <BanIcon /> Cancel with credit note
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open === "send"} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send by email</DialogTitle>
            <DialogDescription>
              The PDF is attached and the email links to the online version{kind === "invoice" ? " where it can be paid" : ""}.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="send-to">Recipient</FieldLabel>
            <Input id="send-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button disabled={pending || !to} onClick={() => run(() => sendByEmail(id, to), { onSuccess: close })}>
              {pending ? <Spinner /> : <MailIcon />} Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open === "payment"} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Record a payment</DialogTitle>
            <DialogDescription>Part payments are fine — the invoice is marked paid once it is fully covered.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field>
              <FieldLabel htmlFor="pay-amount">Amount</FieldLabel>
              <Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="pay-date">Received on</FieldLabel>
              <Input id="pay-date" type="date" value={paidDate} max={today} onChange={(e) => setPaidDate(e.target.value)} />
            </Field>
          </div>
          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() =>
                run(() => addPayment(id, { date: paidDate, amountMinor: parseAmountInput(amount) ?? 0 }), { success: "Payment recorded", onSuccess: close })
              }
            >
              Record payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open === "recurring"} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Make recurring</DialogTitle>
            <DialogDescription>A copy of this invoice becomes the template. New invoices are created and numbered automatically.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="rec-frequency">Every</FieldLabel>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger id="rec-frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Week</SelectItem>
                  <SelectItem value="monthly">Month</SelectItem>
                  <SelectItem value="quarterly">Quarter</SelectItem>
                  <SelectItem value="yearly">Year</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="rec-start">First invoice on</FieldLabel>
              <Input id="rec-start" type="date" min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="rec-count">Number of invoices</FieldLabel>
              <Input
                id="rec-count"
                inputMode="numeric"
                placeholder="Until cancelled"
                value={count}
                onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))}
              />
            </Field>
            <Field orientation="horizontal" className="sm:col-span-2">
              <Switch id="rec-send" checked={autoSend} onCheckedChange={setAutoSend} disabled={!props.emailEnabled} />
              <div>
                <FieldLabel htmlFor="rec-send">Email each invoice automatically</FieldLabel>
                {!props.emailEnabled ? <FieldDescription>Available once email sending is set up.</FieldDescription> : null}
              </div>
            </Field>
          </div>
          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() => run(() => makeRecurring(id, { frequency, startDate, count: count ? Number(count) : null, autoSend }), { onSuccess: close })}
            >
              <RepeatIcon /> Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={open === "cancel"} onOpenChange={(o) => !o && close()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              Issued invoices can’t be deleted. We’ll issue a credit note (Stornorechnung) that reverses it in full and mark this invoice cancelled — the
              compliant way to keep your numbering and books intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep invoice</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(() => cancelWithCreditNote(id), { onSuccess: close })}>Issue credit note</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
