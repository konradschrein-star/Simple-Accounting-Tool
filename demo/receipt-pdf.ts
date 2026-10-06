/**
 * A one-page receipt as a minimal, valid PDF (Helvetica, WinAnsi) — enough for the demo inbox to show and open
 * real documents without bundling binaries or rendering asynchronously during the seed.
 */
export function receiptPdf(lines: { text: string; size?: number; bold?: boolean; gapBefore?: number }[]): Buffer {
  // The base-14 fonts only cover WinAnsi; spell out what demo data could contain beyond ASCII.
  const ascii = (s: string) =>
    s
      .replace(/[  ]/g, " ")
      .replace(/€/g, "EUR")
      .replace(/£/g, "GBP")
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/Ä/g, "Ae")
      .replace(/Ö/g, "Oe")
      .replace(/Ü/g, "Ue")
      .replace(/ß/g, "ss")
      .replace(/[–—]/g, "-")
      .replace(/[^\x20-\x7e]/g, "?")
      .replace(/[\\()]/g, (c) => `\\${c}`)
  let y = 790
  const ops = lines
    .map(({ text, size = 10, bold, gapBefore = 0 }) => {
      y -= gapBefore + size * 1.5
      return `BT /${bold ? "F2" : "F1"} ${size} Tf 56 ${y} Td (${ascii(text)}) Tj ET`
    })
    .join("\n")
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(ops, "latin1")} >>\nstream\n${ops}\nendstream`,
  ]
  let body = "%PDF-1.4\n"
  const offsets: number[] = []
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body, "latin1"))
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xref = Buffer.byteLength(body, "latin1")
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body, "latin1")
}
