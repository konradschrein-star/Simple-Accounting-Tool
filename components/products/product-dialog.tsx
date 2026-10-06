"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useServerAction } from "@/components/use-server-action"
import { formatRate, minorToInput, parseAmountInput } from "@/lib/money"
import { saveProductAction } from "@/server/actions/products"

export type ProductFormValue = { id: string; name: string; description: string; unit: string; unitPriceMinor: number; taxRateBp: number | null }

const DEFAULT_RATE = "default"

export function ProductDialog({
  product,
  trigger,
  taxRatesBp,
  locale,
}: {
  product?: ProductFormValue
  trigger: React.ReactNode
  taxRatesBp: number[]
  locale: string
}) {
  const [open, setOpen] = useState(false)
  const { pending, run } = useServerAction()
  const [rate, setRate] = useState(product?.taxRateBp === null || product?.taxRateBp === undefined ? DEFAULT_RATE : String(product.taxRateBp))

  function submit(form: FormData) {
    const input = {
      name: String(form.get("name") ?? ""),
      description: String(form.get("description") ?? ""),
      unit: String(form.get("unit") ?? ""),
      unitPriceMinor: parseAmountInput(String(form.get("price") ?? "")) ?? -1,
      taxRateBp: rate === DEFAULT_RATE ? null : Number(rate),
    }
    run(() => saveProductAction(product?.id ?? null, input), { onSuccess: () => setOpen(false) })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? "Edit product" : "New product or service"}</DialogTitle>
          <DialogDescription>Saved items can be added to any invoice or quote in one click.</DialogDescription>
        </DialogHeader>
        <form action={submit}>
          <FieldGroup className="grid grid-cols-2 gap-4">
            <Field className="col-span-2">
              <FieldLabel htmlFor="product-name">Name</FieldLabel>
              <Input id="product-name" name="name" required defaultValue={product?.name} placeholder="e.g. Strategy workshop (day rate)" />
            </Field>
            <Field className="col-span-2">
              <FieldLabel htmlFor="product-description">Description (optional)</FieldLabel>
              <Textarea id="product-description" name="description" rows={2} defaultValue={product?.description} />
            </Field>
            <Field>
              <FieldLabel htmlFor="product-price">Unit price (net)</FieldLabel>
              <Input
                id="product-price"
                name="price"
                inputMode="decimal"
                required
                defaultValue={product ? minorToInput(product.unitPriceMinor) : ""}
                placeholder="0.00"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="product-unit">Unit (optional)</FieldLabel>
              <Input id="product-unit" name="unit" defaultValue={product?.unit} placeholder="h, day, pcs…" />
            </Field>
            {taxRatesBp.length > 1 || taxRatesBp[0] !== 0 ? (
              <Field className="col-span-2">
                <FieldLabel htmlFor="product-rate">Tax rate</FieldLabel>
                <Select value={rate} onValueChange={setRate}>
                  <SelectTrigger id="product-rate">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_RATE}>Use the invoice’s default rate</SelectItem>
                    {taxRatesBp.map((bp) => (
                      <SelectItem key={bp} value={String(bp)}>
                        {formatRate(bp, locale)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
