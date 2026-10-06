import { Document, Image, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer"
import type { InvoiceSnapshot } from "@/invoicing/rules"
import { fromIso } from "@/lib/dates"
import { formatMoney, formatRate } from "@/lib/money"
import { LABELS } from "./labels"

export type InvoiceDocumentProps = {
  snapshot: InvoiceSnapshot
  number: string | null
  issueDate: string
  serviceDate: string | null
  dueDate: string
  notes: string
  paymentTerms: string
  stripePaymentLink: string
  watermark: "draft" | "cancelled" | null
  logo: { data: Buffer; format: "png" | "jpg" } | null
}

const INK = "#111827"
const MUTED = "#6b7280"
const LINE = "#e5e7eb"
const ACCENT = "#0f766e"

const s = StyleSheet.create({
  page: { fontFamily: "Noto Sans", fontSize: 9, color: INK, paddingTop: 40, paddingBottom: 90, paddingHorizontal: 48, lineHeight: 1.4 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 },
  logo: { maxWidth: 140, maxHeight: 56, objectFit: "contain" },
  sellerName: { fontSize: 14, fontWeight: 700 },
  title: { fontSize: 22, fontWeight: 700, color: ACCENT, textAlign: "right", lineHeight: 1.15 },
  senderLine: { fontSize: 7, color: MUTED, textDecoration: "underline", marginBottom: 6 },
  addressRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 28 },
  addressBlock: { width: "55%" },
  bold: { fontWeight: 700 },
  meta: { width: "40%" },
  metaRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5 },
  metaLabel: { color: MUTED },
  table: { borderTopWidth: 1, borderTopColor: INK },
  th: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: LINE, fontWeight: 700, fontSize: 8 },
  tr: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: LINE },
  cPos: { width: "6%" },
  cDesc: { width: "44%", paddingRight: 8 },
  cQty: { width: "10%", textAlign: "right" },
  cUnit: { width: "15%", textAlign: "right" },
  sub: { fontSize: 7, color: MUTED },
  cTax: { width: "9%", textAlign: "right" },
  cAmt: { width: "16%", textAlign: "right" },
  totals: { marginTop: 10, marginLeft: "45%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grandTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1.5,
    borderTopColor: INK,
    fontSize: 11,
    fontWeight: 700,
  },
  section: { marginTop: 22 },
  note: { color: MUTED },
  payButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: ACCENT,
    color: "#ffffff",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
    fontWeight: 700,
    textDecoration: "none",
  },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 8,
    fontSize: 7,
    color: MUTED,
  },
  footerCol: { width: "32%" },
  watermark: {
    position: "absolute",
    top: 330,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 96,
    fontWeight: 700,
    color: "#ef4444",
    opacity: 0.12,
    transform: "rotate(-30deg)",
  },
})

export function InvoiceDocument(props: InvoiceDocumentProps) {
  const { snapshot: snap } = props
  const t = LABELS[snap.language]
  const kind = snap.kind
  const title = t.title[kind]
  const money = (minor: number) => formatMoney(minor, snap.currency, snap.locale)
  const date = (iso: string) => new Intl.DateTimeFormat(snap.locale, { dateStyle: "medium", timeZone: "UTC" }).format(fromIso(iso))
  const qty = (milli: number) => new Intl.NumberFormat(snap.locale, { maximumFractionDigits: 3 }).format(milli / 1000)
  const subtotal = snap.items.reduce((sum, i) => sum + i.netMinor, 0)
  const tax = snap.taxGroups.reduce((sum, g) => sum + g.taxMinor, 0)
  const seller = snap.seller
  const client = snap.client
  const sellerAddress = [seller.addressLine1, seller.addressLine2, [seller.postcode, seller.city].filter(Boolean).join(" "), seller.country].filter(Boolean)
  const clientAddress = [client.addressLine1, client.addressLine2, [client.postcode, client.city].filter(Boolean).join(" "), client.country].filter(Boolean)
  const bankLines = [
    seller.bankIban && `IBAN ${seller.bankIban}`,
    seller.bankBic && `BIC ${seller.bankBic}`,
    seller.ukSortCode && `Sort code ${seller.ukSortCode}`,
    seller.ukAccountNumber && `Account ${seller.ukAccountNumber}`,
    seller.usRoutingNumber && `Routing ${seller.usRoutingNumber}`,
  ].filter(Boolean) as string[]

  return (
    <Document title={`${title} ${props.number ?? ""}`.trim()} author={seller.name}>
      <Page size="A4" style={s.page}>
        {props.watermark ? (
          <Text style={s.watermark} fixed>
            {props.watermark === "cancelled" ? t.cancelled : t.draft}
          </Text>
        ) : null}

        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
          {props.logo ? <Image style={s.logo} src={props.logo} /> : <Text style={s.sellerName}>{seller.name}</Text>}
          <View>
            <Text style={s.title}>{title}</Text>
            {props.number ? <Text style={{ textAlign: "right", color: MUTED, marginTop: 4 }}>{props.number}</Text> : null}
            {snap.relatedNumber && kind === "credit_note" ? <Text style={{ textAlign: "right", color: MUTED }}>{t.corrects(snap.relatedNumber)}</Text> : null}
          </View>
        </View>

        <View style={s.addressRow}>
          <View style={s.addressBlock}>
            <Text style={s.senderLine}>{[seller.legalName || seller.name, ...sellerAddress.slice(0, 3)].join(" · ")}</Text>
            <Text style={s.bold}>{client.name}</Text>
            {clientAddress.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
          </View>
          <View style={s.meta}>
            {props.number ? <MetaRow label={t.number[kind]} value={props.number} /> : null}
            <MetaRow label={t.issueDate[kind]} value={date(props.issueDate)} />
            {props.serviceDate ? <MetaRow label={t.serviceDate} value={date(props.serviceDate)} /> : null}
            {kind === "credit_note" ? null : <MetaRow label={kind === "quote" ? t.validUntil : t.dueDate} value={date(props.dueDate)} />}
            {client.vatId ? <MetaRow label={t.clientVatId} value={client.vatId} /> : null}
          </View>
        </View>

        <View style={s.table}>
          <View style={s.th} fixed>
            <Text style={s.cPos}>{t.pos}</Text>
            <Text style={s.cDesc}>{t.description}</Text>
            <Text style={s.cQty}>{t.qty}</Text>
            <Text style={s.cUnit}>{t.unitPrice}</Text>
            <Text style={s.cTax}>{snap.taxLabel}</Text>
            <Text style={s.cAmt}>{t.amount}</Text>
          </View>
          {snap.items.map((item, index) => (
            <View style={s.tr} key={index} wrap={false}>
              <Text style={s.cPos}>{index + 1}</Text>
              <Text style={s.cDesc}>{item.description}</Text>
              <Text style={s.cQty}>
                {qty(item.quantityMilli)}
                {item.unit ? ` ${item.unit}` : ""}
              </Text>
              <View style={s.cUnit}>
                <Text>{money(item.unitPriceMinor)}</Text>
                {item.discountBp ? (
                  <Text style={s.sub}>
                    −{formatRate(item.discountBp, snap.locale)} {t.discount}
                  </Text>
                ) : null}
              </View>
              <Text style={s.cTax}>{formatRate(item.taxRateBp, snap.locale)}</Text>
              <Text style={s.cAmt}>{money(item.netMinor)}</Text>
            </View>
          ))}
        </View>

        <View style={s.totals} wrap={false}>
          <View style={s.totalRow}>
            <Text>{t.subtotal}</Text>
            <Text>{money(subtotal)}</Text>
          </View>
          {snap.exemptionNote
            ? null
            : snap.taxGroups
                .filter((g) => g.rateBp > 0 || snap.taxGroups.length > 1)
                .map((g) => (
                  <View style={s.totalRow} key={g.rateBp}>
                    <Text style={s.metaLabel}>{t.taxOn(snap.taxLabel, formatRate(g.rateBp, snap.locale), money(g.netMinor))}</Text>
                    <Text>{money(g.taxMinor)}</Text>
                  </View>
                ))}
          <View style={s.grandTotal}>
            <Text>{t.total}</Text>
            <Text>{money(subtotal + tax)}</Text>
          </View>
        </View>

        <View style={s.section} wrap={false}>
          {snap.exemptionNote ? <Text style={[s.bold, { marginBottom: 6 }]}>{snap.exemptionNote}</Text> : null}
          <Text>{kind === "quote" ? t.quoteValid(date(props.dueDate)) : kind === "credit_note" ? t.credited : t.payableBy(date(props.dueDate))}</Text>
          {props.paymentTerms ? <Text style={s.note}>{props.paymentTerms}</Text> : null}
          {props.notes ? (
            <View style={{ marginTop: 8 }}>
              <Text style={s.bold}>{t.notes}</Text>
              <Text style={s.note}>{props.notes}</Text>
            </View>
          ) : null}
          {props.stripePaymentLink && kind === "invoice" ? (
            <Link src={props.stripePaymentLink} style={s.payButton}>
              {t.payOnline} →
            </Link>
          ) : null}
        </View>

        <View style={s.footer} fixed>
          <View style={s.footerCol}>
            <Text style={s.bold}>{seller.legalName || seller.name}</Text>
            {sellerAddress.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
          </View>
          <View style={s.footerCol}>
            {seller.email ? <Text>{seller.email}</Text> : null}
            {seller.phone ? <Text>{seller.phone}</Text> : null}
            {seller.website ? <Text>{seller.website}</Text> : null}
            {seller.taxNumber ? (
              <Text>
                {t.taxNumber}: {seller.taxNumber}
              </Text>
            ) : null}
            {seller.vatId ? (
              <Text>
                {t.vatId}: {seller.vatId}
              </Text>
            ) : null}
          </View>
          <View style={s.footerCol}>
            {bankLines.length ? <Text style={s.bold}>{t.bankDetails}</Text> : null}
            {bankLines.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metaRow}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text>{value}</Text>
    </View>
  )
}
