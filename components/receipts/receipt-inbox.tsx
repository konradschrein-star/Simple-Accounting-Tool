"use client"

import { CheckIcon, FileTextIcon, LinkIcon, SearchIcon, Trash2Icon, TriangleAlertIcon, UploadCloudIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { useDropzone } from "react-dropzone"
import { toast } from "sonner"
import { RECEIPT_UPLOAD, type CandidateTransaction } from "@/bookkeeping/receipts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { useServerAction } from "@/components/use-server-action"
import { formatDate } from "@/lib/dates"
import { formatMoney, type CurrencyCode } from "@/lib/money"
import { cn } from "@/lib/utils"
import { linkReceipt, removeReceipt, unlinkReceipt } from "@/server/actions/receipts"
import type { ReceiptListItem } from "@/server/repos/receipts"
import { uploadReceipt } from "./upload-receipt"

type Props = { receipts: ReceiptListItem[]; candidates: CandidateTransaction[]; currency: CurrencyCode; locale: string; taxLabel: string; aiEnabled: boolean }

export function ReceiptUploader() {
  const router = useRouter()
  const [queue, setQueue] = useState(0)
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    maxSize: RECEIPT_UPLOAD.maxBytes,
    accept: RECEIPT_UPLOAD.accept,
    onDropRejected: (rejections) => toast.error(`${rejections.length} file${rejections.length === 1 ? "" : "s"} skipped — PDF, JPG or PNG up to 10 MB.`),
    onDropAccepted: async (files) => {
      setQueue(files.length)
      for (const file of files) {
        const error = await uploadReceipt(file)
        if (error) toast.error(`${file.name}: ${error}`)
        setQueue((n) => n - 1)
      }
      router.refresh()
    },
  })
  return (
    <div
      {...getRootProps()}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-card px-6 py-8 text-center transition-colors hover:border-primary/60",
        isDragActive && "border-primary bg-primary/5"
      )}
    >
      <input {...getInputProps()} />
      <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
        {queue ? <Spinner /> : <UploadCloudIcon className="size-5" />}
      </div>
      <p className="font-medium">{queue ? `Uploading ${queue} receipt${queue === 1 ? "" : "s"}…` : "Drop receipts and supplier invoices here"}</p>
      <p className="text-sm text-muted-foreground">PDF, JPG or PNG — we read the vendor, date, total and VAT, and find the matching bank payment.</p>
    </div>
  )
}

/** What a receipt card says, from its reading state alone. */
function receiptSubtitle(r: ReceiptListItem, aiEnabled: boolean, locale: string): string {
  if (r.readStatus === "processing") return "Reading…"
  if (r.readStatus === "failed") return aiEnabled ? "Couldn’t read this one — match it by hand" : "Automatic reading is off — match it by hand"
  return r.extracted?.date ? formatDate(r.extracted.date, locale) : "No date found"
}

function TransactionPicker({
  candidates,
  onPick,
  money,
  locale,
}: {
  candidates: CandidateTransaction[]
  onPick: (id: string) => void
  money: (m: number) => string
  locale: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <SearchIcon /> Find payment
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <Command>
          <CommandInput placeholder="Search amount, payee or text…" />
          <CommandList>
            <CommandEmpty>No unmatched payments found.</CommandEmpty>
            <CommandGroup>
              {candidates.map((t) => (
                <CommandItem
                  key={t.id}
                  value={`${t.counterparty} ${t.description} ${(Math.abs(t.amountMinor) / 100).toFixed(2)} ${t.date} ${t.id}`}
                  onSelect={() => {
                    setOpen(false)
                    onPick(t.id)
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{t.counterparty || t.description}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(t.date, locale)}</div>
                  </div>
                  <span className="tabular-nums">{money(t.amountMinor)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function ReceiptInbox({ receipts, candidates, currency, locale, taxLabel, aiEnabled }: Props) {
  const router = useRouter()
  const { pending, run } = useServerAction()
  const money = (minor: number, c: string | null = currency) => formatMoney(minor, (c ?? currency) as CurrencyCode, locale)
  const reading = receipts.some((r) => r.readStatus === "processing")

  // While the AI reads, poll so results appear without a reload.
  useEffect(() => {
    if (!reading) return
    const timer = setInterval(() => router.refresh(), 2500)
    return () => clearInterval(timer)
  }, [reading, router])

  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {receipts.map((r) => {
        const x = r.extracted
        const attached = r.match === "attached"
        return (
          <Card key={r.id} className="gap-0 py-0">
            <CardContent className="flex gap-4 p-4">
              <a
                href={`/api/receipts/${r.id}/file`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted"
                aria-label={`Open ${r.filename}`}
              >
                {r.mimeType === "application/pdf" ? (
                  <FileTextIcon className="size-6 text-muted-foreground" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- private, authenticated file; next/image would proxy it
                  <img src={`/api/receipts/${r.id}/file`} alt="" className="size-full object-cover" />
                )}
              </a>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{x?.vendor ?? r.filename}</p>
                    <p className="text-xs text-muted-foreground">{receiptSubtitle(r, aiEnabled, locale)}</p>
                  </div>
                  <div className="text-right">
                    {r.readStatus === "processing" ? <Spinner className="size-4" /> : null}
                    {r.readStatus === "failed" ? <TriangleAlertIcon className="size-4 text-warning" aria-label="Not readable" /> : null}
                    {x?.totalMinor != null ? <p className="font-semibold tabular-nums">{money(x.totalMinor, x.currency)}</p> : null}
                    {x?.vatMinor ? (
                      <p className="text-xs text-muted-foreground tabular-nums">
                        incl. {money(x.vatMinor, x.currency)} {taxLabel}
                      </p>
                    ) : null}
                  </div>
                </div>

                {r.transaction ? (
                  <div
                    className={cn("rounded-md border px-2.5 py-1.5 text-xs", attached ? "border-success/30 bg-success/5" : "border-primary/30 bg-primary/5")}
                  >
                    <div className="flex items-center gap-1.5 font-medium">
                      {attached ? <CheckIcon className="size-3 text-success" /> : <LinkIcon className="size-3 text-primary" />}
                      {attached ? "Attached to" : "Looks like"} {r.transaction.counterparty || r.transaction.description}
                    </div>
                    <div className="text-muted-foreground">
                      {formatDate(r.transaction.date, locale)} · {money(r.transaction.amountMinor)}
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {attached ? (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => unlinkReceipt(r.id))}>
                      Detach
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        aria-label="Delete receipt"
                        disabled={pending}
                        onClick={() => run(() => removeReceipt(r.id))}
                      >
                        <Trash2Icon />
                      </Button>
                      {r.readStatus !== "processing" ? (
                        <TransactionPicker candidates={candidates} money={(m) => money(m)} locale={locale} onPick={(id) => run(() => linkReceipt(r.id, id))} />
                      ) : null}
                      {r.match === "suggested" && r.transaction ? (
                        <Button size="sm" disabled={pending} onClick={() => run(() => linkReceipt(r.id, r.transaction!.id))}>
                          <CheckIcon /> Match
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>
                {r.match === "open" && r.readStatus === "read" ? <Badge variant="outline">No matching payment yet</Badge> : null}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
