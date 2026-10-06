"use client"

import { AlertTriangleIcon, CheckCircle2Icon, PackageIcon, PlusIcon, RepeatIcon, Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useFieldArray, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { ClientDialog } from "@/components/clients/client-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { useServerAction } from "@/components/use-server-action"
import { KIND_LABELS, type DocumentKind } from "@/invoicing/documents"
import { computeTotals, formatMoney, formatRate, minorToInput, parseAmountInput, parsePercentInput, parseQuantityInput, type CurrencyCode } from "@/lib/money"
import { cn } from "@/lib/utils"
import { finalize, removeDraft, saveInvoiceDraft } from "@/server/actions/invoices"

/** Figures sit on their own row under the description, so the editor stays usable next to the live preview. */
const FIGURES_GRID = "grid grid-cols-2 gap-2 sm:grid-cols-[5rem_5rem_minmax(6rem,1fr)_5rem_minmax(5.5rem,7rem)]"

/** All numeric fields are kept as typed strings and parsed on save, so partial input like "7." stays editable. */
type LineForm = { description: string; quantity: string; unit: string; unitPrice: string; discount: string; taxRate: string }
type EditorForm = {
  clientId: string
  currency: CurrencyCode
  issueDate: string
  serviceDate: string
  dueDate: string
  notes: string
  paymentTerms: string
  stripePaymentLink: string
  lines: LineForm[]
}

export type CatalogProduct = { id: string; name: string; description: string; unit: string; unitPriceMinor: number; taxRateBp: number | null }

export type InvoiceEditorProps = {
  invoiceId: string
  kind: DocumentKind
  /** Set when this draft is the template of a recurring series: it is edited, never finalized. */
  recurringTemplate: boolean
  initial: Omit<EditorForm, "lines"> & {
    lines: { description: string; quantityMilli: number; unitPriceMinor: number; taxRateBp: number; discountBp: number; unit: string }[]
  }
  clients: { id: string; name: string; currency: CurrencyCode | null }[]
  products: CatalogProduct[]
  currencies: readonly CurrencyCode[]
  taxRatesBp: number[]
  taxLabel: string
  locale: string
  serviceDateLabel: string
  blockers: string[]
  exemptionNote: string | null
}

function toPayload(values: EditorForm, productIds: string[]) {
  return {
    clientId: values.clientId || null,
    currency: values.currency,
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
      taxRateBp: parsePercentInput(l.taxRate) ?? 0,
      discountBp: Math.min(parsePercentInput(l.discount) ?? 0, 10_000),
      unit: l.unit.trim(),
    })),
    productIds,
  }
}

export function InvoiceEditor(props: InvoiceEditorProps) {
  const router = useRouter()
  const label = KIND_LABELS[props.kind].singular
  const [addedClients, setAddedClients] = useState<InvoiceEditorProps["clients"]>([])
  const clients = [...props.clients, ...addedClients.filter((a) => !props.clients.some((c) => c.id === a.id))].sort((a, b) => a.name.localeCompare(b.name))
  // Catalog items picked since the last save; their usage counter is bumped with the save.
  const [pickedProducts, setPickedProducts] = useState<string[]>([])
  const [catalogOpen, setCatalogOpen] = useState(false)
  const { pending: deleting, run } = useServerAction()
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved")
  const [previewVersion, setPreviewVersion] = useState(0)
  const [finalizing, startFinalize] = useTransition()
  const form = useForm<EditorForm>({
    defaultValues: {
      ...props.initial,
      lines: props.initial.lines.map((l) => ({
        description: l.description,
        quantity: String(l.quantityMilli / 1000),
        unit: l.unit,
        unitPrice: minorToInput(l.unitPriceMinor),
        discount: l.discountBp ? String(l.discountBp / 100) : "",
        taxRate: String(l.taxRateBp / 100),
      })),
    },
  })
  const lines = useFieldArray({ control: form.control, name: "lines" })
  const values = useWatch({ control: form.control }) as EditorForm
  const payload = useMemo(() => toPayload(values, pickedProducts), [values, pickedProducts])
  const totals = computeTotals(payload.lines)
  const money = (minor: number) => formatMoney(minor, values.currency, props.locale)

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
      setPickedProducts([])
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
      toast.success(`${label} finalized — ready to send`)
      router.refresh()
    })
  }

  const rateOptions = props.taxRatesBp.length > 1 || props.taxRatesBp[0] !== 0
  const defaultRate = () => values.lines?.[values.lines.length - 1]?.taxRate ?? String(props.taxRatesBp[0] / 100)

  function addProduct(product: CatalogProduct) {
    const usable = product.taxRateBp !== null && (!rateOptions || props.taxRatesBp.includes(product.taxRateBp))
    const line: LineForm = {
      description: product.description ? `${product.name} — ${product.description}` : product.name,
      quantity: "1",
      unit: product.unit,
      unitPrice: minorToInput(product.unitPriceMinor),
      discount: "",
      taxRate: usable ? String(product.taxRateBp! / 100) : defaultRate(),
    }
    // Replace the untouched starter line instead of leaving it empty above the product.
    const only = values.lines?.length === 1 ? values.lines[0] : null
    if (only && !only.description && !parseAmountInput(only.unitPrice)) lines.update(0, line)
    else lines.append(line)
    setPickedProducts((ids) => [...ids, product.id])
    setCatalogOpen(false)
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{props.kind === "quote" ? "Quote for" : "Bill to"}</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="client">Client</FieldLabel>
                <div className="flex gap-2">
                  <Select
                    value={values.clientId || undefined}
                    onValueChange={(v) => {
                      form.setValue("clientId", v)
                      const preferred = clients.find((c) => c.id === v)?.currency
                      if (preferred) form.setValue("currency", preferred)
                    }}
                  >
                    <SelectTrigger id="client" className="flex-1">
                      <SelectValue placeholder="Choose a client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
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
                      setAddedClients((cs) => [...cs, { id: client.id, name: client.name, currency: null }])
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
                <FieldLabel htmlFor="dueDate">{props.kind === "quote" ? "Valid until" : "Due date"}</FieldLabel>
                <Input id="dueDate" type="date" {...form.register("dueDate")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="currency">Currency</FieldLabel>
                <Select value={values.currency} onValueChange={(v) => form.setValue("currency", v as CurrencyCode)}>
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {props.currencies.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="paymentTerms">Payment terms (optional)</FieldLabel>
                <Input id="paymentTerms" placeholder="e.g. Net 14, 2% discount within 7 days" {...form.register("paymentTerms")} />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Line items</CardTitle>
            {props.products.length ? (
              <CardAction>
                <Popover open={catalogOpen} onOpenChange={setCatalogOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm">
                      <PackageIcon /> From catalog
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 p-0">
                    <Command>
                      <CommandInput placeholder="Search products & services…" />
                      <CommandList>
                        <CommandEmpty>Nothing found.</CommandEmpty>
                        <CommandGroup>
                          {props.products.map((p) => (
                            <CommandItem key={p.id} value={`${p.name} ${p.description} ${p.id}`} onSelect={() => addProduct(p)}>
                              <span className="flex-1 truncate">{p.name}</span>
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {money(p.unitPriceMinor)}
                                {p.unit ? ` / ${p.unit}` : ""}
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className={cn(FIGURES_GRID, "hidden pr-[3.3rem] pl-[0.8rem] text-xs font-medium text-muted-foreground sm:grid")}>
              <span className="text-right">Qty</span>
              <span>Unit</span>
              <span className="text-right">Unit price</span>
              <span className="text-right">Disc. %</span>
              <span>{props.taxLabel}</span>
            </div>
            {lines.fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-[minmax(0,1fr)_2rem] gap-x-2 gap-y-2 rounded-lg border p-3">
                <Input aria-label="Description" placeholder="What did you deliver?" {...form.register(`lines.${index}.description`)} />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove line"
                  onClick={() => lines.remove(index)}
                  disabled={lines.fields.length === 1}
                >
                  <Trash2Icon />
                </Button>
                <div className={FIGURES_GRID}>
                  <Input aria-label="Quantity" inputMode="decimal" className="text-right tabular-nums" {...form.register(`lines.${index}.quantity`)} />
                  <Input aria-label="Unit" placeholder="Unit" {...form.register(`lines.${index}.unit`)} />
                  <Input aria-label="Unit price" inputMode="decimal" className="text-right tabular-nums" {...form.register(`lines.${index}.unitPrice`)} />
                  <Input
                    aria-label="Discount %"
                    inputMode="decimal"
                    placeholder="0"
                    className="text-right tabular-nums"
                    {...form.register(`lines.${index}.discount`)}
                  />
                  {rateOptions ? (
                    <Select value={values.lines?.[index]?.taxRate} onValueChange={(v) => form.setValue(`lines.${index}.taxRate`, v)}>
                      <SelectTrigger aria-label="Tax rate" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {props.taxRatesBp.map((bp) => (
                          <SelectItem key={bp} value={String(bp / 100)}>
                            {formatRate(bp, props.locale)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input aria-label="Sales tax %" inputMode="decimal" placeholder="0" {...form.register(`lines.${index}.taxRate`)} />
                  )}
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => lines.append({ description: "", quantity: "1", unit: "", unitPrice: "0.00", discount: "", taxRate: defaultRate() })}
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
              {props.kind === "invoice" ? (
                <Field>
                  <FieldLabel htmlFor="stripe">Online payment link (optional)</FieldLabel>
                  <Input id="stripe" placeholder="https://buy.stripe.com/…" {...form.register("stripePaymentLink")} />
                  <FieldDescription>Adds a “Pay online now” button to the PDF and the online invoice — e.g. a Stripe Payment Link.</FieldDescription>
                </Field>
              ) : null}
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
          {props.recurringTemplate ? null : (
            <>
              <Button variant="ghost" size="sm" disabled={deleting} onClick={() => run(() => removeDraft(props.invoiceId))}>
                Delete draft
              </Button>
              <Button onClick={onFinalize} disabled={finalizing || props.blockers.length > 0}>
                {finalizing ? <Spinner /> : null} Finalize {label.toLowerCase()}
              </Button>
            </>
          )}
        </div>
        {props.recurringTemplate ? (
          <Alert>
            <RepeatIcon />
            <AlertTitle>Recurring template</AlertTitle>
            <AlertDescription>Edits apply to every future invoice in this series. Each one is numbered and dated when it is created.</AlertDescription>
          </Alert>
        ) : props.blockers.length ? (
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
            title={`${label} preview`}
            src={`/api/invoices/${props.invoiceId}/pdf?v=${previewVersion}#toolbar=0&navpanes=0&view=FitH`}
            className="h-[75vh] w-full"
          />
        </div>
      </div>
    </div>
  )
}
