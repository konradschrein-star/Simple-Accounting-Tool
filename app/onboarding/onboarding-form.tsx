"use client"

import { useActionState, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import type { JurisdictionCode } from "@/jurisdictions/types"
import { completeOnboarding } from "@/server/actions/onboarding"

const OPTIONS: { code: JurisdictionCode; flag: string; name: string; detail: string }[] = [
  { code: "de", flag: "🇩🇪", name: "Germany", detail: "EUR · USt 19 % / 7 % · §14 UStG invoices" },
  { code: "uk", flag: "🇬🇧", name: "United Kingdom", detail: "GBP · VAT 20 % / 5 % · Self Assessment" },
  { code: "us", flag: "🇺🇸", name: "United States", detail: "USD · Sales tax · 1040-ES estimates" },
  { code: "je", flag: "🇯🇪", name: "Jersey", detail: "GBP · GST 5 % · quarterly GST returns" },
]

export function OnboardingForm({ defaultName, defaultEmail }: { defaultName: string; defaultEmail: string }) {
  const [state, action, pending] = useActionState(completeOnboarding, {})
  const [jurisdiction, setJurisdiction] = useState<JurisdictionCode>("de")
  const [registered, setRegistered] = useState(true)
  const [smallBusiness, setSmallBusiness] = useState(false)
  const taxLabel = { de: "USt", uk: "VAT", us: "sales tax", je: "GST" }[jurisdiction]
  const showFiling = registered && !(jurisdiction === "de" && smallBusiness) && jurisdiction !== "us"

  return (
    <form action={action} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Where is your business based?</CardTitle>
          <CardDescription>This sets your currency, invoice rules, tax deadlines and chart of accounts.</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            name="jurisdiction"
            value={jurisdiction}
            onValueChange={(v) => setJurisdiction(v as JurisdictionCode)}
            className="grid gap-3 sm:grid-cols-2"
          >
            {OPTIONS.map((o) => (
              <FieldLabel key={o.code} htmlFor={`j-${o.code}`} className="cursor-pointer">
                <Field orientation="horizontal">
                  <span className="text-2xl" aria-hidden>
                    {o.flag}
                  </span>
                  <div className="flex-1">
                    <div className="font-medium">{o.name}</div>
                    <FieldDescription>{o.detail}</FieldDescription>
                  </div>
                  <RadioGroupItem value={o.code} id={`j-${o.code}`} />
                </Field>
              </FieldLabel>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Business details</CardTitle>
          <CardDescription>Printed on your invoices. You can change everything later in settings.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="businessName">Business name</FieldLabel>
                <Input id="businessName" name="businessName" defaultValue={defaultName} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="legalName">Legal name (optional)</FieldLabel>
                <Input id="legalName" name="legalName" placeholder="e.g. Jane Doe Consulting Ltd" />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="addressLine1">Street address</FieldLabel>
                <Input id="addressLine1" name="addressLine1" />
              </Field>
              <Field>
                <FieldLabel htmlFor="postcode">Postcode / ZIP</FieldLabel>
                <Input id="postcode" name="postcode" />
              </Field>
              <Field>
                <FieldLabel htmlFor="city">City</FieldLabel>
                <Input id="city" name="city" />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="email">Billing email</FieldLabel>
                <Input id="email" name="email" type="email" defaultValue={defaultEmail} />
              </Field>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tax setup</CardTitle>
          <CardDescription>Drives the tax lines on invoices and your deadline reminders.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="horizontal">
              <Switch id="taxRegistered" name="taxRegistered" checked={registered} onCheckedChange={setRegistered} />
              <FieldLabel htmlFor="taxRegistered">I am registered for {taxLabel}</FieldLabel>
            </Field>
            {jurisdiction === "de" && registered ? (
              <Field orientation="horizontal">
                <Switch id="smallBusinessExempt" name="smallBusinessExempt" checked={smallBusiness} onCheckedChange={setSmallBusiness} />
                <div>
                  <FieldLabel htmlFor="smallBusinessExempt">Kleinunternehmer (§19 UStG)</FieldLabel>
                  <FieldDescription>Invoices carry no USt and the statutory §19 note.</FieldDescription>
                </div>
              </Field>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="taxNumber">
                  {jurisdiction === "de" ? "Steuernummer" : jurisdiction === "us" ? "EIN (optional)" : "UTR / tax reference (optional)"}
                </FieldLabel>
                <Input id="taxNumber" name="taxNumber" />
              </Field>
              {jurisdiction !== "us" ? (
                <Field>
                  <FieldLabel htmlFor="vatId">{jurisdiction === "de" ? "USt-IdNr." : `${taxLabel} number`}</FieldLabel>
                  <Input id="vatId" name="vatId" />
                </Field>
              ) : null}
            </div>
            {showFiling ? (
              <FieldSet>
                <FieldLegend variant="label">Filing schedule</FieldLegend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel>Return frequency</FieldLabel>
                    <Select name="vatFilingFrequency" defaultValue="quarterly">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  {jurisdiction === "de" ? (
                    <Field orientation="horizontal" className="self-end">
                      <Switch id="deDauerfrist" name="deDauerfrist" />
                      <FieldLabel htmlFor="deDauerfrist">Dauerfristverlängerung</FieldLabel>
                    </Field>
                  ) : (
                    <Field>
                      <FieldLabel>First quarter ends in</FieldLabel>
                      <Select name="vatPeriodEndMonth" defaultValue="3">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">January (Jan/Apr/Jul/Oct)</SelectItem>
                          <SelectItem value="2">February (Feb/May/Aug/Nov)</SelectItem>
                          <SelectItem value="3">March (Mar/Jun/Sep/Dec)</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                </div>
              </FieldSet>
            ) : null}
          </FieldGroup>
        </CardContent>
      </Card>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null} Create my workspace
      </Button>
    </form>
  )
}
