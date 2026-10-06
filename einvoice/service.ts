import "server-only"
import "./libxml-windows"
import { generate } from "@stafyniaksacha/facturx"
import { PDFDocument } from "pdf-lib"
import type { Db } from "@/db/client"
import type { Jurisdiction } from "@/jurisdictions"
import { DomainError } from "@/lib/action-result"
import { invoicePdf } from "@/pdf/invoice-file"
import type { previewContext } from "@/server/repos/invoices"
import { buildCiiXml, eInvoiceProblems, type EInvoiceInput, type EInvoiceProfile } from "./cii"

type Preview = NonNullable<ReturnType<typeof previewContext>>
export type EInvoiceFormat = "zugferd" | "xrechnung"

const PROFILE: Record<EInvoiceFormat, EInvoiceProfile> = { zugferd: "en16931", xrechnung: "xrechnung" }
const HOME_COUNTRY: Record<Jurisdiction["code"], string> = { de: "DE", uk: "GB", us: "US", je: "JE" }

/** E-invoices exist for issued invoices and credit notes — never drafts or quotes. */
export function eInvoiceInput(ctx: Preview, jurisdiction: Jurisdiction): EInvoiceInput | null {
  const { invoice, snapshot } = ctx
  if (invoice.kind === "quote" || invoice.status === "draft" || !invoice.number) return null
  return {
    kind: invoice.kind,
    number: invoice.number,
    issueDate: invoice.issueDate,
    serviceDate: invoice.serviceDate,
    dueDate: invoice.dueDate,
    notes: invoice.notes,
    paymentTerms: invoice.paymentTerms,
    relatedNumber: snapshot.relatedNumber ?? null,
    snapshot,
    homeCountry: HOME_COUNTRY[jurisdiction.code],
    buyerReference: ctx.client?.buyerReference ?? "",
  }
}

/** What blocks each format for this document; `null` when e-invoicing does not apply at all. */
export function eInvoiceReadiness(ctx: Preview, jurisdiction: Jurisdiction): Record<EInvoiceFormat, string[]> | null {
  const input = eInvoiceInput(ctx, jurisdiction)
  if (!input) return null
  return { zugferd: eInvoiceProblems(input, "en16931"), xrechnung: eInvoiceProblems(input, "xrechnung") }
}

export async function eInvoiceFile(db: Db, orgId: string, ctx: Preview, jurisdiction: Jurisdiction, format: EInvoiceFormat): Promise<{ filename: string; contentType: string; body: Uint8Array }> {
  const input = eInvoiceInput(ctx, jurisdiction)
  if (!input) throw new DomainError("Only issued invoices and credit notes can be exported as e-invoices.")
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
