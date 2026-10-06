/** Everything that can happen to a document, with exactly the details each event carries. */
export type InvoiceEvent =
  | { type: "finalized"; detail: { number: string } }
  | { type: "sent"; detail: { to: string; messageId: string } }
  | { type: "viewed"; detail: null }
  | { type: "payment"; detail: { amountMinor: number; date: string; method: "bank" | "manual" | "online" } }
  | { type: "payment_removed"; detail: { amountMinor: number; date: string } }
  | { type: "reminder"; detail: { level: number; feeMinor: number } }
  | { type: "cancelled"; detail: { creditNote: string } }
  | { type: "accepted" | "declined"; detail: { by: "client" | "user" } }
  | { type: "converted"; detail: { invoiceId: string } }
  | { type: "generated"; detail: { seriesId: string } }
  | { type: "send_failed"; detail: { error: string } }

export type InvoiceEventType = InvoiceEvent["type"]
export type EventDetail<T extends InvoiceEventType> = Extract<InvoiceEvent, { type: T }>["detail"]
