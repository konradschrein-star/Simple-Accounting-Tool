"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import type { Client } from "@/server/repos/clients"
import { saveClient } from "@/server/actions/clients"

const FIELDS: { name: keyof Omit<Client, "id" | "orgId" | "createdAt" | "language" | "currency">; label: string; span?: boolean; type?: string }[] = [
  { name: "name", label: "Name / company", span: true },
  { name: "email", label: "Email", type: "email", span: true },
  { name: "addressLine1", label: "Street address", span: true },
  { name: "addressLine2", label: "Address line 2", span: true },
  { name: "postcode", label: "Postcode / ZIP" },
  { name: "city", label: "City" },
  { name: "country", label: "Country" },
  { name: "vatId", label: "VAT ID (optional)" },
  { name: "buyerReference", label: "Buyer reference / Leitweg-ID (optional)", span: true },
]

const DEFAULT = "default"

export function ClientDialog({
  client,
  trigger,
  onSaved,
}: {
  client?: Client
  trigger: React.ReactNode
  onSaved?: (client: Client | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function submit(form: FormData) {
    startTransition(async () => {
      const values = Object.fromEntries([...form].map(([k, v]) => [k, v === DEFAULT ? "" : v]))
      const result = await saveClient(client?.id ?? null, values)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(client ? "Client updated" : "Client added")
      setOpen(false)
      onSaved?.(result.client)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{client ? "Edit client" : "New client"}</DialogTitle>
          <DialogDescription>Address details are printed on invoices and required in most countries.</DialogDescription>
        </DialogHeader>
        <form action={submit}>
          <FieldGroup className="grid grid-cols-2 gap-4">
            {FIELDS.map((f) => (
              <Field key={f.name} className={f.span ? "col-span-2" : undefined}>
                <FieldLabel htmlFor={`client-${f.name}`}>{f.label}</FieldLabel>
                <Input id={`client-${f.name}`} name={f.name} type={f.type ?? "text"} defaultValue={client?.[f.name] ?? ""} required={f.name === "name"} />
              </Field>
            ))}
            <Field>
              <FieldLabel htmlFor="client-language">Document language</FieldLabel>
              <Select name="language" defaultValue={client?.language ?? DEFAULT}>
                <SelectTrigger id="client-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT}>Workspace default</SelectItem>
                  <SelectItem value="de">Deutsch</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="client-currency">Currency</FieldLabel>
              <Select name="currency" defaultValue={client?.currency ?? DEFAULT}>
                <SelectTrigger id="client-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT}>Workspace default</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null} Save client
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
