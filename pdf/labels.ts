export type InvoiceLabels = {
  invoice: string
  number: string
  issueDate: string
  serviceDate: string
  dueDate: string
  clientVatId: string
  pos: string
  description: string
  qty: string
  unitPrice: string
  tax: string
  amount: string
  subtotal: string
  taxOn: (label: string, rate: string, net: string) => string
  total: string
  payableBy: (date: string) => string
  bankDetails: string
  payOnline: string
  taxNumber: string
  vatId: string
  draft: string
  void: string
  notes: string
}

export const LABELS: Record<"de" | "en", InvoiceLabels> = {
  de: {
    invoice: "Rechnung",
    number: "Rechnungsnummer",
    issueDate: "Rechnungsdatum",
    serviceDate: "Leistungsdatum",
    dueDate: "Fällig am",
    clientVatId: "USt-IdNr. Kunde",
    pos: "Pos.",
    description: "Beschreibung",
    qty: "Menge",
    unitPrice: "Einzelpreis",
    tax: "USt",
    amount: "Betrag",
    subtotal: "Nettobetrag",
    taxOn: (label, rate, net) => `${label} ${rate} auf ${net}`,
    total: "Gesamtbetrag",
    payableBy: (date) => `Bitte überweisen Sie den Gesamtbetrag bis zum ${date}.`,
    bankDetails: "Bankverbindung",
    payOnline: "Jetzt online bezahlen",
    taxNumber: "Steuernummer",
    vatId: "USt-IdNr.",
    draft: "ENTWURF",
    void: "STORNIERT",
    notes: "Hinweise",
  },
  en: {
    invoice: "Invoice",
    number: "Invoice number",
    issueDate: "Issue date",
    serviceDate: "Date of supply",
    dueDate: "Due date",
    clientVatId: "Client VAT no.",
    pos: "#",
    description: "Description",
    qty: "Qty",
    unitPrice: "Unit price",
    tax: "Tax",
    amount: "Amount",
    subtotal: "Subtotal (net)",
    taxOn: (label, rate, net) => `${label} ${rate} on ${net}`,
    total: "Total due",
    payableBy: (date) => `Please pay the total amount by ${date}.`,
    bankDetails: "Bank details",
    payOnline: "Pay online now",
    taxNumber: "Tax reference",
    vatId: "VAT no.",
    draft: "DRAFT",
    void: "VOID",
    notes: "Notes",
  },
}
