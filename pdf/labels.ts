type Kind = "invoice" | "quote" | "credit_note"

export type InvoiceLabels = {
  title: Record<Kind, string>
  number: Record<Kind, string>
  validUntil: string
  corrects: (number: string) => string
  quoteValid: (date: string) => string
  credited: string
  unit: string
  discount: string
  cancelled: string
  issueDate: Record<Kind, string>
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
    // Not "Gutschrift": in German VAT law that means self-billing (§14(2) UStG). A reversal is a Stornorechnung.
    title: { invoice: "Rechnung", quote: "Angebot", credit_note: "Stornorechnung" },
    number: { invoice: "Rechnungsnummer", quote: "Angebotsnummer", credit_note: "Belegnummer" },
    validUntil: "Gültig bis",
    corrects: (number) => `Korrektur zu Rechnung ${number}`,
    quoteValid: (date) => `Dieses Angebot ist gültig bis zum ${date}.`,
    credited: "Der Betrag wird Ihnen gutgeschrieben bzw. erstattet.",
    unit: "Einheit",
    discount: "Rabatt",
    cancelled: "STORNIERT",
    issueDate: { invoice: "Rechnungsdatum", quote: "Angebotsdatum", credit_note: "Datum" },
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
    title: { invoice: "Invoice", quote: "Quote", credit_note: "Credit note" },
    number: { invoice: "Invoice number", quote: "Quote number", credit_note: "Credit note number" },
    validUntil: "Valid until",
    corrects: (number) => `Corrects invoice ${number}`,
    quoteValid: (date) => `This quote is valid until ${date}.`,
    credited: "This amount will be credited or refunded to you.",
    unit: "Unit",
    discount: "Discount",
    cancelled: "CANCELLED",
    issueDate: { invoice: "Issue date", quote: "Date", credit_note: "Date" },
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
