import "server-only"
import "./libxml-windows"
import { generate } from "@stafyniaksacha/facturx"
import { PDFDocument } from "pdf-lib"
import type { Db } from "@/db/client"
import { DomainError } from "@/lib/action-result"
import { invoicePdf } from "@/pdf/invoice-file"
import type { DocumentContext } from "@/server/repos/invoices"
import { buildCiiXml, eInvoiceProblems, type EInvoiceInput, type EInvoiceProfile } from "./cii"

export const E_INVOICE_FORMATS = ["zugferd", "xrechnung"] as const
export type EInvoiceFormat = (typeof E_INVOICE_FORMATS)[number]

const PROFILE: Record<EInvoiceFormat, EInvoiceProfile> = { zugferd: "en16931", xrechnung: "xrechnung" }

/** The e-invoice view of a document, or null where e-invoicing doesn't apply (other jurisdictions, drafts, quotes). */
export function eInvoiceInput(ctx: DocumentContext): EInvoiceInput | null {
  const { invoice, snapshot, jurisdiction } = ctx
  if (!jurisdiction.eInvoicing || snapshot.kind === "quote" || invoice.status === "draft" || !invoice.number) return null
  return {
    kind: snapshot.kind,
    number: invoice.number,
    issueDate: invoice.issueDate,
    serviceDate: invoice.serviceDate,
    dueDate: invoice.dueDate,
    notes: invoice.notes,
    paymentTerms: invoice.paymentTerms,
    relatedNumber: snapshot.relatedNumber,
    snapshot,
    homeCountry: jurisdiction.countryCode,
    // Frozen with the document; documents issued before it was frozen fall back to the client's current reference.
    buyerReference: snapshot.client.buyerReference || ctx.client?.buyerReference || "",
  }
}

/** What blocks each format for this document; null when e-invoicing doesn't apply at all. */
export function eInvoiceReadiness(ctx: DocumentContext): Record<EInvoiceFormat, string[]> | null {
  const input = eInvoiceInput(ctx)
  if (!input) return null
  return { zugferd: eInvoiceProblems(input, "en16931"), xrechnung: eInvoiceProblems(input, "xrechnung") }
}

export async function eInvoiceFile(
  db: Db,
  orgId: string,
  ctx: DocumentContext,
  format: EInvoiceFormat
): Promise<{ filename: string; contentType: string; body: Uint8Array }> {
  const input = eInvoiceInput(ctx)
  if (!input) throw new DomainError("E-invoices are available for issued invoices and credit notes of German workspaces.")
  const problems = eInvoiceProblems(input, PROFILE[format])
  if (problems.length) throw new DomainError(problems.join(" "))
  const xml = buildCiiXml(input, PROFILE[format])
  const base = input.number.replace(/[^\w.-]/g, "_")
  if (format === "xrechnung") return { filename: `${base}_xrechnung.xml`, contentType: "application/xml; charset=utf-8", body: new TextEncoder().encode(xml) }
  // ZUGFeRD 2 / Factur-X: the human-readable PDF with the XML embedded as PDF/A-3 attachment, XSD-checked on the way.
  const pdf = await PDFDocument.load(await invoicePdf(db, orgId, ctx))
  // The generator mints its own document ID for the PDF/A-3 metadata and refuses files that already carry one.
  delete pdf.context.trailerInfo.ID
  const body = await generate({ pdf, xml, flavor: "facturx", level: "en16931", check: true, language: input.snapshot.language === "de" ? "de-DE" : "en-GB" })
  return { filename: `${base}_zugferd.pdf`, contentType: "application/pdf", body }
}
