import { DomainError } from "@/lib/action-result"
import type { IsoDate } from "@/lib/dates"
import { displayStatus, openAmount, type DocumentKind, type DocumentStatus } from "./documents"

/**
 * The one place that decides what can happen to a document. Repos assert it before writing, the owner's
 * screens and the client's public page render from it — so buttons, links and rules can't disagree.
 */
export type DocAction =
  | "edit"
  | "finalize"
  | "delete"
  | "duplicate"
  | "send"
  | "share"
  | "pay"
  | "removePayment"
  | "cancel"
  | "makeRecurring"
  | "accept"
  | "decline"
  | "convert"
  /** The client answering a quote from its public link (only while it is still valid). */
  | "respond"

export type LifecycleDoc = { kind: DocumentKind; status: DocumentStatus; dueDate: IsoDate; totalMinor: number }

export function allowedActions(doc: LifecycleDoc, today: IsoDate, paidMinor: number): ReadonlySet<DocAction> {
  const allowed = new Set<DocAction>()
  const add = (...actions: DocAction[]) => actions.forEach((a) => allowed.add(a))
  if (doc.kind === "recurring_template") return new Set(["edit"])
  if (doc.status === "draft") return new Set(["edit", "finalize", "delete", "duplicate"])
  add("share")
  switch (doc.kind) {
    case "invoice":
      add("duplicate")
      if (doc.status === "cancelled") break
      add("send", "cancel", "makeRecurring")
      if (paidMinor > 0) add("removePayment")
      if (doc.status === "finalized" && openAmount(doc.totalMinor, paidMinor) > 0) add("pay")
      break
    case "quote": {
      add("duplicate")
      if (doc.status === "converted") break
      add("send", "convert")
      if (doc.status !== "accepted") add("accept")
      if (doc.status !== "declined") add("decline")
      if (displayStatus(doc, today) === "sent") add("respond")
      break
    }
    case "credit_note":
      add("send")
      break
  }
  return allowed
}

export class LifecycleError extends DomainError {}

const REFUSALS: Record<DocAction, string> = {
  edit: "Issued documents can’t be edited",
  finalize: "This document is already issued",
  delete: "Only drafts can be deleted",
  duplicate: "This document can’t be duplicated",
  send: "This document can’t be sent",
  share: "Drafts have no share link yet",
  pay: "This invoice can’t take a payment",
  removePayment: "This invoice has no payments to remove",
  cancel: "Only issued invoices can be cancelled",
  makeRecurring: "Only issued invoices can be made recurring",
  accept: "This quote can’t be accepted",
  decline: "This quote can’t be declined",
  convert: "This quote can’t be turned into an invoice",
  respond: "This quote can no longer be answered",
}

export function assertAllowed(doc: LifecycleDoc, today: IsoDate, paidMinor: number, action: DocAction) {
  if (!allowedActions(doc, today, paidMinor).has(action)) throw new LifecycleError(REFUSALS[action])
}
