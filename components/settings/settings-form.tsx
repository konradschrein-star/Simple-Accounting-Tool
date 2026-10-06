"use client"

import { useActionState, useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import type { BankField, JurisdictionCode } from "@/jurisdictions/types"
import { saveSettings } from "@/server/actions/settings"
import type { WorkspaceSettings } from "@/server/repos/workspace"

const BANK_LABELS: Record<BankField, { name: keyof WorkspaceSettings; label: string }> = {
  iban: { name: "bankIban", label: "IBAN" },
  bic: { name: "bankBic", label: "BIC / SWIFT" },
  sortCode: { name: "ukSortCode", label: "Sort code" },
  accountNumber: { name: "ukAccountNumber", label: "Account number" },
  routingNumber: { name: "usRoutingNumber", label: "Routing number (ABA)" },
}

function TextField({ name, label, value, description, className }: { name: string; label: string; value: string; description?: string; className?: string }) {
  return (
    <Field className={className}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input id={name} name={name} defaultValue={value} />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  )
}

export function SettingsForm({
  orgName,
  settings,
  jurisdiction,
  taxLabel,
  taxIdLabel,
  bankFields,
}: {
  orgName: string
  settings: WorkspaceSettings
  jurisdiction: JurisdictionCode
  taxLabel: string
  taxIdLabel: string
  bankFields: BankField[]
}) {
  const [state, action, pending] = useActionState(saveSettings, {})
  const [registered, setRegistered] = useState(settings.taxRegistered || settings.smallBusinessExempt)
  const [smallBusiness, setSmallBusiness] = useState(settings.smallBusinessExempt)
  useEffect(() => {
    if (state.ok) toast.success("Settings saved")
    if (state.error) toast.error(state.error)
  }, [state])
  const s = settings

  return (
    <form action={action} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Business profile</CardTitle>
          <CardDescription>Printed in the header and footer of every invoice.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <TextField name="businessName" label="Business name" value={orgName} />
            <TextField name="legalName" label="Legal name" value={s.legalName} />
            <TextField name="addressLine1" label="Street address" value={s.addressLine1} className="sm:col-span-2" />
            <TextField name="addressLine2" label="Address line 2" value={s.addressLine2} className="sm:col-span-2" />
            <TextField name="postcode" label="Postcode / ZIP" value={s.postcode} />
            <TextField name="city" label="City" value={s.city} />
            <TextField name="country" label="Country" value={s.country} />
            <TextField name="email" label="Billing email" value={s.email} />
            <TextField name="phone" label="Phone" value={s.phone} />
            <TextField name="website" label="Website" value={s.website} />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tax</CardTitle>
          <CardDescription>Controls tax lines on invoices and your deadline reminders.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="horizontal">
              <Switch id="taxRegistered" name="taxRegistered" checked={registered} onCheckedChange={setRegistered} />
              <FieldLabel htmlFor="taxRegistered">Registered for {taxLabel}</FieldLabel>
            </Field>
            {jurisdiction === "de" && registered ? (
              <Field orientation="horizontal">
                <Switch id="smallBusinessExempt" name="smallBusinessExempt" checked={smallBusiness} onCheckedChange={setSmallBusiness} />
                <FieldLabel htmlFor="smallBusinessExempt">Kleinunternehmer (§19 UStG)</FieldLabel>
              </Field>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="taxNumber" label={jurisdiction === "de" ? "Steuernummer" : "Tax reference"} value={s.taxNumber} description={taxIdLabel} />
              <TextField name="vatId" label={jurisdiction === "de" ? "USt-IdNr." : `${taxLabel} number`} value={s.vatId} />
              <Field>
                <FieldLabel>Return frequency</FieldLabel>
                <Select name="vatFilingFrequency" defaultValue={s.vatFilingFrequency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="none">Not filing</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {jurisdiction === "de" ? (
                <Field orientation="horizontal" className="self-end">
                  <Switch id="deDauerfrist" name="deDauerfrist" defaultChecked={s.deDauerfrist} />
                  <FieldLabel htmlFor="deDauerfrist">Dauerfristverlängerung</FieldLabel>
                </Field>
              ) : (
                <Field>
                  <FieldLabel>First quarter ends in</FieldLabel>
                  <Select name="vatPeriodEndMonth" defaultValue={String(s.vatPeriodEndMonth)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">January</SelectItem>
                      <SelectItem value="2">February</SelectItem>
                      <SelectItem value="3">March</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoicing & bank details</CardTitle>
          <CardDescription>How clients pay you.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            {bankFields.map((f) => (
              <TextField key={f} name={BANK_LABELS[f].name} label={BANK_LABELS[f].label} value={String(s[BANK_LABELS[f].name] ?? "")} />
            ))}
            <TextField name="invoicePrefix" label="Invoice number prefix" value={s.invoicePrefix} description={`Next number: ${s.invoicePrefix}${new Date().getFullYear()}-${String(s.nextInvoiceSeq).padStart(4, "0")}`} />
            <Field>
              <FieldLabel htmlFor="defaultPaymentTermsDays">Default payment terms (days)</FieldLabel>
              <Input id="defaultPaymentTermsDays" name="defaultPaymentTermsDays" type="number" min={0} max={365} defaultValue={s.defaultPaymentTermsDays} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle>Free advisory review</CardTitle>
          <CardDescription>
            Let our advisors see your summary metrics (revenue, cash collected, expenses, margin — never individual transactions) so we can proactively flag
            risks and growth opportunities. You can turn this off at any time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field orientation="horizontal">
            <Switch id="advisoryOptIn" name="advisoryOptIn" defaultChecked={s.advisoryOptIn} />
            <FieldLabel htmlFor="advisoryOptIn">Share summary metrics with advisors</FieldLabel>
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Spinner /> : null} Save settings
        </Button>
      </div>
    </form>
  )
}
