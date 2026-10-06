// Generates public/samples/sample-statement.pdf — a realistic, fictitious German bank statement with a text layer.
// Run: pnpm tsx scripts/make-sample-statement.tsx
import fs from "node:fs"
import path from "node:path"
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer"

const fonts = path.join(process.cwd(), "assets", "fonts")
Font.register({ family: "Noto Sans", fonts: [{ src: path.join(fonts, "NotoSans-Regular.ttf") }, { src: path.join(fonts, "NotoSans-Bold.ttf"), fontWeight: 700 }] })

const rows: [string, string, string, number][] = [
  ["01.09.2026", "Gutschrift", "Kaffeerösterei Elbe KG · RE INV-2026-0011", 2856.0],
  ["01.09.2026", "Dauerauftrag", "Hausverwaltung Schmidt · Miete Atelier September", -950.0],
  ["03.09.2026", "Kartenzahlung", "ADOBE SYSTEMS · Creative Cloud", -66.45],
  ["05.09.2026", "Gutschrift", "Praxis Dr. Weber · RE INV-2026-0012", 1785.0],
  ["07.09.2026", "Lastschrift", "Hetzner Online GmbH · Server September", -38.68],
  ["10.09.2026", "Lastschrift", "Finanzamt Berlin · USt-VA 08/2026", -1240.0],
  ["12.09.2026", "Lastschrift", "Deutsche Telekom · Mobilfunk & Internet", -59.99],
  ["14.09.2026", "Kartenzahlung", "Restaurant Lokal · Kundenessen", -184.5],
  ["18.09.2026", "Gutschrift", "Velo Werk Leipzig UG · RE INV-2026-0013", 3570.0],
  ["21.09.2026", "Überweisung", "Freelance Collective · Illustration Projekt Elbe", -1200.0],
  ["25.09.2026", "Umbuchung", "Übertrag auf Tagesgeldkonto", -2000.0],
  ["28.09.2026", "Kartenzahlung", "Deutsche Bahn · Fahrkarte Hamburg", -89.9],
]
const opening = 8420.35
const eur = (n: number) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2 }).format(Math.abs(n)) + (n < 0 ? " S" : " H")
const s = StyleSheet.create({
  page: { fontFamily: "Noto Sans", fontSize: 8.5, padding: 40, color: "#111" },
  bank: { fontSize: 14, fontWeight: 700, color: "#c00" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ddd", paddingVertical: 4 },
  head: { flexDirection: "row", borderBottomWidth: 1, paddingVertical: 4, fontWeight: 700 },
  c1: { width: "14%" },
  c2: { width: "16%" },
  c3: { width: "40%" },
  c4: { width: "15%", textAlign: "right" },
  c5: { width: "15%", textAlign: "right" },
})

let balance = opening
const lines = rows.map(([date, type, text, amount]) => {
  balance = Math.round((balance + amount) * 100) / 100
  return { date, type, text, amount, balance }
})

const doc = (
  <Document title="Kontoauszug 09/2026">
    <Page size="A4" style={s.page}>
      <Text style={s.bank}>Musterbank Berlin</Text>
      <Text style={{ marginTop: 4 }}>Kontoauszug Nr. 09/2026 · Girokonto DE89 3704 0044 0532 0130 00 · Studio Nord – Lea Hartmann</Text>
      <Text style={{ marginBottom: 14 }}>Zeitraum 01.09.2026 – 30.09.2026 · Währung EUR</Text>
      <Text style={{ marginBottom: 8, fontWeight: 700 }}>Alter Kontostand vom 31.08.2026: {eur(opening)}</Text>
      <View style={s.head}>
        <Text style={s.c1}>Buchung</Text>
        <Text style={s.c2}>Vorgang</Text>
        <Text style={s.c3}>Verwendungszweck</Text>
        <Text style={s.c4}>Betrag</Text>
        <Text style={s.c5}>Saldo</Text>
      </View>
      {lines.map((l) => (
        <View style={s.row} key={l.date + l.text}>
          <Text style={s.c1}>{l.date}</Text>
          <Text style={s.c2}>{l.type}</Text>
          <Text style={s.c3}>{l.text}</Text>
          <Text style={s.c4}>{eur(l.amount)}</Text>
          <Text style={s.c5}>{eur(l.balance)}</Text>
        </View>
      ))}
      <Text style={{ marginTop: 10, fontWeight: 700 }}>Neuer Kontostand vom 30.09.2026: {eur(balance)}</Text>
      <Text style={{ marginTop: 24, color: "#666" }}>S = Soll (Belastung) · H = Haben (Gutschrift). Fiktiver Beispielauszug zu Demonstrationszwecken.</Text>
    </Page>
  </Document>
)

const out = path.join(process.cwd(), "public", "samples", "sample-statement.pdf")
fs.writeFileSync(out, await renderToBuffer(doc))
console.log(`wrote ${out} (closing balance ${balance})`)
