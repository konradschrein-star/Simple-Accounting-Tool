"use client"

import { ExternalLinkIcon, FileTextIcon, LockIcon, PaperclipIcon, ReceiptTextIcon, UploadIcon } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useRef, useState } from "react"
import { toast } from "sonner"
import type { AccountRef } from "@/bookkeeping/categorize"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { useServerAction } from "@/components/use-server-action"
import { formatDate } from "@/lib/dates"
import { formatMoney, formatRate, type CurrencyCode } from "@/lib/money"
import { cn } from "@/lib/utils"
import { assignAccount, setTransactionNote, setTransactionVatRate } from "@/server/actions/bookkeeping"
import { unlinkReceipt } from "@/server/actions/receipts"
import type { TransactionDetail } from "@/server/repos/transaction-detail"
import { uploadReceipt } from "@/components/receipts/upload-receipt"
import { AccountSelect } from "./account-select"

const DEFAULT = "default"

/** Detail sheet for one ledger line, driven by `?txn=` so it can be linked to and survives reloads. */
export function TransactionSheet({
  detail,
  accounts,
  ratesBp,
  taxLabel,
  showVat,
  currency,
  locale,
}: {
  detail: TransactionDetail
  accounts: AccountRef[]
  ratesBp: number[]
  taxLabel: string
  showVat: boolean
  currency: CurrencyCode
  locale: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const { pending, run } = useServerAction()
  const [note, setNote] = useState(detail.note)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const money = (m: number, c: string | null = currency) => formatMoney(m, (c ?? currency) as CurrencyCode, locale)

  const close = () => {
    const next = new URLSearchParams(params)
    next.delete("txn")
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false })
  }

  async function upload(file: File) {
    setUploading(true)
    const error = await uploadReceipt(file, detail.id)
    setUploading(false)
    if (error) return void toast.error(error)
    toast.success("Receipt attached — we’ll read the details in a moment")
    router.refresh()
  }

  const outgoing = detail.amountMinor < 0
  return (
    <Sheet open onOpenChange={(open) => !open && close()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetDescription>{formatDate(detail.date, locale)}</SheetDescription>
          <SheetTitle className="text-xl">{detail.counterparty || detail.description}</SheetTitle>
          <p className={cn("text-2xl font-semibold tabular-nums", outgoing ? "" : "text-success")}>{money(detail.amountMinor)}</p>
          {detail.counterparty ? <p className="text-sm text-muted-foreground">{detail.description}</p> : null}
        </SheetHeader>

        <div className="space-y-6 p-4">
          {detail.locked ? (
            <Alert>
              <LockIcon />
              <AlertDescription>This month is closed. Reopen it under Books to change the booking.</AlertDescription>
            </Alert>
          ) : null}

          <Field>
            <FieldLabel>Account</FieldLabel>
            {detail.locked ? (
              <p className="text-sm">{accounts.find((a) => a.id === detail.accountId)?.name ?? "—"}</p>
            ) : (
              <AccountSelect
                label="Account"
                accounts={accounts}
                value={detail.accountId}
                sign={outgoing ? "out" : "in"}
                onChange={(accountId) => run(() => assignAccount([detail.id], accountId), { success: "Saved" })}
              />
            )}
          </Field>

          {showVat && outgoing ? (
            <Field>
              <FieldLabel htmlFor="txn-vat">{taxLabel} included</FieldLabel>
              <Select
                value={detail.vatRateBp === null ? DEFAULT : String(detail.vatRateBp)}
                disabled={detail.locked || pending}
                onValueChange={(v) => run(() => setTransactionVatRate(detail.id, v === DEFAULT ? null : Number(v)), { success: "Saved" })}
              >
                <SelectTrigger id="txn-vat" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT}>
                    Account default{detail.defaultVatRateBp !== null ? ` (${formatRate(detail.defaultVatRateBp, locale)})` : ""}
                  </SelectItem>
                  {[...new Set([...ratesBp, 0])].map((bp) => (
                    <SelectItem key={bp} value={String(bp)}>
                      {bp ? formatRate(bp, locale) : `No ${taxLabel}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>Decides the input tax you reclaim for this payment.</FieldDescription>
            </Field>
          ) : null}

          <Field>
            <FieldLabel htmlFor="txn-note">Note</FieldLabel>
            <Textarea
              id="txn-note"
              rows={3}
              value={note}
              disabled={detail.locked}
              placeholder="What was this for? Helps at year end."
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note !== detail.note && run(() => setTransactionNote(detail.id, note), { success: "Note saved" })}
            />
          </Field>

          {detail.invoice ? (
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href={`/invoices/${detail.invoice.id}`}>
                <ReceiptTextIcon /> Pays invoice {detail.invoice.number}
              </Link>
            </Button>
          ) : null}

          <Separator />

          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <PaperclipIcon className="size-4" /> Receipt
            </p>
            {detail.receipt ? (
              <div className="space-y-3">
                <a
                  href={`/api/receipts/${detail.receipt.id}/file`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden rounded-lg border bg-muted"
                >
                  {detail.receipt.mimeType.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element -- private, authenticated file
                    <img src={`/api/receipts/${detail.receipt.id}/file`} alt={detail.receipt.filename} className="max-h-72 w-full object-contain" />
                  ) : (
                    <span className="flex items-center gap-2 p-4 text-sm">
                      <FileTextIcon className="size-5 text-muted-foreground" /> {detail.receipt.filename}{" "}
                      <ExternalLinkIcon className="ml-auto size-4 text-muted-foreground" />
                    </span>
                  )}
                </a>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {detail.receipt.reading ? "Reading…" : (detail.receipt.vendor ?? detail.receipt.filename)}
                    {detail.receipt.totalMinor !== null ? ` · ${money(detail.receipt.totalMinor, detail.receipt.currency)}` : ""}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(() => unlinkReceipt(detail.receipt!.id), { success: "Receipt detached" })}
                  >
                    Detach
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
                />
                <Button variant="outline" className="w-full" disabled={uploading} onClick={() => fileInput.current?.click()}>
                  {uploading ? <Spinner /> : <UploadIcon />} Attach receipt
                </Button>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
