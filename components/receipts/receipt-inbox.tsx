"use client"

import { CheckIcon, FileTextIcon, LinkIcon, SearchIcon, Trash2Icon, TriangleAlertIcon, UploadCloudIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { useDropzone } from "react-dropzone"
import { toast } from "sonner"
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

export type BankRow = { id: string; date: string; amountMinor: number; description: string; counterparty: string }
export type InboxReceipt = {
  id: string
  filename: string
  mimeType: string
  status: "processing" | "unmatched" | "suggested" | "matched" | "failed"
  extracted: { vendor: string | null; date: string | null; totalMinor: number | null; vatMinor: number | null; currency: string | null } | null
  transaction: BankRow | null
  suggestion: BankRow | null
}

type Props = { receipts: InboxReceipt[]; candidates: BankRow[]; currency: CurrencyCode; locale: string; taxLabel: string; aiEnabled: boolean }

export function ReceiptUploader() {
  const router = useRouter()
  const [queue, setQueue] = useState(0)
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    maxSize: 10 * 1024 * 1024,
    accept: { "application/pdf": [".pdf"], "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"] },
    onDropRejected: (rejections) => toast.error(`${rejections.length} file${rejections.length === 1 ? "" : "s"} skipped — PDF, JPG or PNG up to 10 MB.`),
    onDropAccepted: async (files) => {
      setQueue(files.length)
      for (const file of files) {
        const body = new FormData()
        body.set("file", file)
        const response = await fetch("/api/receipts", { method: "POST", body }).catch(() => null)
        if (!response?.ok) toast.error(`${file.name}: ${(await response?.json().catch(() => null))?.error ?? "upload failed"}`)
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
        isDragActive && "border-primary bg-primary/5",
      )}
    >
      <input {...getInputProps()} />
      <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">{queue ? <Spinner /> : <UploadCloudIcon className="size-5" />}</div>
      <p className="font-medium">{queue ? `Uploading ${queue} receipt${queue === 1 ? "" : "s"}…` : "Drop receipts and supplier invoices here"}</p>
      <p className="text-sm text-muted-foreground">PDF, JPG or PNG — we read the vendor, date, total and VAT, and find the matching bank payment.</p>
    </div>
  )
}

function TransactionPicker({ candidates, onPick, money, locale }: { candidates: BankRow[]; onPick: (id: string) => void; money: (m: number) => string; locale: string }) {
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
  const reading = receipts.some((r) => r.status === "processing")

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
        const linked = r.transaction ?? r.suggestion
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
                {r.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element -- private, authenticated file; next/image would proxy it
                  <img src={`/api/receipts/${r.id}/file`} alt="" className="size-full object-cover" />
                ) : (
                  <FileTextIcon className="size-6 text-muted-foreground" />
                )}
              </a>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{x?.vendor ?? r.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.status === "processing" ? "Reading…" : x?.date ? formatDate(x.date, locale) : r.status === "failed" ? (aiEnabled ? "Couldn’t read this one — match it by hand" : "Automatic reading is off — match it by hand") : "No date found"}
                    </p>
                  </div>
                  <div className="text-right">
                    {r.status === "processing" ? (
                      <Spinner className="size-4" />
                    ) : x?.totalMinor !== null && x?.totalMinor !== undefined ? (
                      <>
                        <p className="font-semibold tabular-nums">{money(x.totalMinor, x.currency)}</p>
                        {x.vatMinor ? (
                          <p className="text-xs text-muted-foreground tabular-nums">
                            incl. {money(x.vatMinor, x.currency)} {taxLabel}
                          </p>
                        ) : null}
                      </>
                    ) : r.status === "failed" ? (
                      <TriangleAlertIcon className="size-4 text-warning" aria-label="Not readable" />
                    ) : null}
                  </div>
                </div>

                {linked ? (
                  <div className={cn("rounded-md border px-2.5 py-1.5 text-xs", r.status === "matched" ? "border-success/30 bg-success/5" : "border-primary/30 bg-primary/5")}>
                    <div className="flex items-center gap-1.5 font-medium">
                      {r.status === "matched" ? <CheckIcon className="size-3 text-success" /> : <LinkIcon className="size-3 text-primary" />}
                      {r.status === "matched" ? "Attached to" : "Looks like"} {linked.counterparty || linked.description}
                    </div>
                    <div className="text-muted-foreground">
                      {formatDate(linked.date, locale)} · {money(linked.amountMinor)}
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {r.status === "matched" ? (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => unlinkReceipt(r.id))}>
                      Detach
                    </Button>
                  ) : (
                    <>
                      <Button size="icon" variant="ghost" className="size-8" aria-label="Delete receipt" disabled={pending} onClick={() => run(() => removeReceipt(r.id))}>
                        <Trash2Icon />
                      </Button>
                      {r.status !== "processing" ? <TransactionPicker candidates={candidates} money={(m) => money(m)} locale={locale} onPick={(id) => run(() => linkReceipt(r.id, id))} /> : null}
                      {r.suggestion ? (
                        <Button size="sm" disabled={pending} onClick={() => run(() => linkReceipt(r.id, r.suggestion!.id))}>
                          <CheckIcon /> Match
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>
                {r.status === "unmatched" ? <Badge variant="outline">No matching payment yet</Badge> : null}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
