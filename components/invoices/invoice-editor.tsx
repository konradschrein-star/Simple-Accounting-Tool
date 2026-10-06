"use client"

import { AlertTriangleIcon, CheckCircle2Icon, PlusIcon, Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useFieldArray, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { ClientDialog } from "@/components/clients/client-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { computeTotals, formatMoney, formatRate, minorToInput, parseAmountInput, parseQuantityInput, type CurrencyCode } from "@/lib/money"
import { finalize, removeDraft, saveInvoiceDraft } from "@/server/actions/invoices"

type LineForm = { description: string; quantity: string; unitPrice: string; taxRateBp: string }
type EditorForm = {
  clientId: string
  issueDate: string
  serviceDate: string
  dueDate: string
  notes: string
  paymentTerms: string
  stripePaymentLink: string
  lines: LineForm[]
}

export type InvoiceEditorProps = {
  invoiceId: string
  initial: Omit<EditorForm, "lines"> & {
    lines: { description: string; quantityMilli: number; unitPriceMinor: number; taxRateBp: number }[]
  }
  clients: { id: string; name: string }[]
  taxRatesBp: number[]
  taxLabel: string
  currency: CurrencyCode
  locale: string
  serviceDateLabel: string
  blockers: string[]
  exemptionNote: string | null
}

function toPayload(values: EditorForm) {
  return {
    clientId: values.clientId || null,
    issueDate: values.issueDate,
    serviceDate: values.serviceDate || null,
    dueDate: values.dueDate,
    notes: values.notes,
    paymentTerms: values.paymentTerms,
    stripePaymentLink: values.stripePaymentLink.trim(),
    lines: values.lines.map((l) => ({
      description: l.description,
      quantityMilli: parseQuantityInput(l.quantity) ?? 0,
      unitPriceMinor: parseAmountInput(l.unitPrice) ?? 0,
      taxRateBp: Number(l.taxRateBp) || 0,
    })),
  }
}

export function InvoiceEditor(props: InvoiceEditorProps) {
  const router = useRouter()
  const [clients, setClients] = useState(props.clients)
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved")
  const [previewVersion, setPreviewVersion] = useState(0)
  const [finalizing, startFinalize] = useTransition()
  const form = useForm<EditorForm>({
    defaultValues: {
      ...props.initial,
      lines: props.initial.lines.map((l) => ({
        description: l.description,
        quantity: String(l.quantityMilli / 1000),
        unitPrice: minorToInput(l.unitPriceMinor),
        taxRateBp: String(l.taxRateBp),
      })),
    },
  })
  const lines = useFieldArray({ control: form.control, name: "lines" })
  const values = useWatch({ control: form.control }) as EditorForm
  const payload = useMemo(() => toPayload(values), [values])
  const totals = computeTotals(payload.lines)
  const money = (minor: number) => formatMoney(minor, props.currency, props.locale)

  // Debounced autosave; the preview iframe reloads after each successful save.
  const serialized = JSON.stringify(payload)
  const lastSaved = useRef(serialized)
  useEffect(() => {
    if (serialized === lastSaved.current) return
    setSaveState("saving")
    const timer = setTimeout(async () => {
      const result = await saveInvoiceDraft(props.invoiceId, JSON.parse(serialized))
      if (!result.ok) {
        setSaveState("error")
        toast.error(result.error)
        return
      }
      lastSaved.current = serialized
      setSaveState("saved")
      setPreviewVersion((v) => v + 1)
      router.refresh()
    }, 700)
    return () => clearTimeout(timer)
  }, [serialized, props.invoiceId, router])

  function onFinalize() {
    startFinalize(async () => {
      if (serialized !== lastSaved.current) {
        const saved = await saveInvoiceDraft(props.invoiceId, JSON.parse(serialized))
        if (!saved.ok) return void toast.error(saved.error)
        lastSaved.current = serialized
      }
      const result = await finalize(props.invoiceId)
      if (!result.ok) return void toast.error(result.error)
      toast.success("Invoice finalized — ready to send")
      router.refresh()
    })
  }

  const rateOptions = props.taxRatesBp.length > 1 || props.taxRatesBp[0] !== 0

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bill to</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field className="sm:col-span-2">
                <FieldLabel>Client</FieldLabel>
                <div className="flex gap-2">
                  <Select value={values.clientId || undefined} onValueChange={(v) => form.setValue("clientId", v)}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Choose a client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                      {clients.length === 0 ? <SelectSeparator /> : null}
                    </SelectContent>
                  </Select>
                  <ClientDialog
                    trigger={
                      <Button type="button" variant="outline">
                        <PlusIcon /> New
                      </Button>
                    }
                    onSaved={(client) => {
                      if (!client) return
                      setClients((cs) => [...cs, { id: client.id, name: client.name }].sort((a, b) => a.name.localeCompare(b.name)))
                      form.setValue("clientId", client.id)
                    }}
                  />
                </div>
              </Field>
              <Field>
                <FieldLabel htmlFor="issueDate">Issue date</FieldLabel>
                <Input id="issueDate" type="date" {...form.register("issueDate")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="serviceDate">{props.serviceDateLabel}</FieldLabel>
                <Input id="serviceDate" type="date" {...form.register("serviceDate")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="dueDate">Due date</FieldLabel>
                <Input id="dueDate" type="date" {...form.register("dueDate")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="paymentTerms">Payment terms (optional)</FieldLabel>
                <Input id="paymentTerms" placeholder="e.g. Net 14, 2% discount within 7 days" {...form.register("paymentTerms")} />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Line items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="hidden grid-cols-[minmax(0,1fr)_5rem_7rem_6rem_2rem] gap-2 text-xs font-medium text-muted-foreground md:grid">
              <span>Description</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Unit price</span>
              <span>{props.taxLabel}</span>
              <span />
            </div>
            {lines.fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-[minmax(0,1fr)_5rem_7rem] gap-2 md:grid-cols-[minmax(0,1fr)_5rem_7rem_6rem_2rem]">
                <Input aria-label="Description" placeholder="What did you deliver?" className="col-span-3 md:col-span-1" {...form.register(`lines.${index}.description`)} />
                <Input aria-label="Quantity" inputMode="decimal" className="text-right tabular-nums" {...form.register(`lines.${index}.quantity`)} />
                <Input aria-label="Unit price" inputMode="decimal" className="text-right tabular-nums" {...form.register(`lines.${index}.unitPrice`)} />
                {rateOptions ? (
                  <Select value={values.lines?.[index]?.taxRateBp} onValueChange={(v) => form.setValue(`lines.${index}.taxRateBp`, v)}>
                    <SelectTrigger aria-label="Tax rate">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {props.taxRatesBp.map((bp) => (
                        <SelectItem key={bp} value={String(bp)}>
                          {formatRate(bp, props.locale)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input aria-label="Sales tax %" inputMode="decimal" placeholder="0" value={Number(values.lines?.[index]?.taxRateBp ?? 0) / 100 || ""} onChange={(e) => form.setValue(`lines.${index}.taxRateBp`, String(Math.round(Number(e.target.value.replace(",", ".")) * 100) || 0))} />
                )}
                <Button type="button" variant="ghost" size="icon" aria-label="Remove line" onClick={() => lines.remove(index)} disabled={lines.fields.length === 1}>
                  <Trash2Icon />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => lines.append({ description: "", quantity: "1", unitPrice: "0.00", taxRateBp: values.lines?.[values.lines.length - 1]?.taxRateBp ?? String(props.taxRatesBp[0]) })}
            >
              <PlusIcon /> Add line
            </Button>

            <div className="ml-auto max-w-xs space-y-1.5 border-t pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{money(totals.subtotalMinor)}</span>
              </div>
              {props.exemptionNote
                ? null
                : totals.taxGroups
                    .filter((g) => g.rateBp > 0)
                    .map((g) => (
                      <div key={g.rateBp} className="flex justify-between">
                        <span className="text-muted-foreground">
                          {props.taxLabel} {formatRate(g.rateBp, props.locale)}
                        </span>
                        <span className="tabular-nums">{money(g.taxMinor)}</span>
                      </div>
                    ))}
              <div className="flex justify-between border-t pt-2 text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{money(totals.totalMinor)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes & payment</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="notes">Notes for the client</FieldLabel>
                <Textarea id="notes" rows={3} placeholder="Thank you for your business!" {...form.register("notes")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="stripe">Online payment link (optional)</FieldLabel>
                <Input id="stripe" placeholder="https://buy.stripe.com/…" {...form.register("stripePaymentLink")} />
                <FieldDescription>Adds a “Pay online now” button to the PDF — e.g. a Stripe Payment Link.</FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            {saveState === "saving" ? (
              <>
                <Spinner className="size-3" /> Saving…
              </>
            ) : saveState === "error" ? (
              <span className="text-destructive">Not saved</span>
            ) : (
              <>
                <CheckCircle2Icon className="size-3 text-success" /> Draft saved
              </>
            )}
          </span>
          <form action={removeDraft.bind(null, props.invoiceId)}>
            <Button variant="ghost" size="sm">
              Delete draft
            </Button>
          </form>
          <Button onClick={onFinalize} disabled={finalizing || props.blockers.length > 0}>
            {finalizing ? <Spinner /> : null} Finalize invoice
          </Button>
        </div>
        {props.blockers.length ? (
          <Alert>
            <AlertTriangleIcon />
            <AlertTitle>Before you can finalize</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {props.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <iframe
            key={previewVersion}
            title="Invoice preview"
            src={`/api/invoices/${props.invoiceId}/pdf?v=${previewVersion}#toolbar=0&navpanes=0&view=FitH`}
            className="h-[75vh] w-full"
          />
        </div>
      </div>
    </div>
  )
}
