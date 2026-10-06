/** Spreadsheet-safe CSV: quotes every text cell and neutralises formula prefixes (CSV injection). */
function cell(value: unknown): string {
  if (typeof value === "number") return String(value)
  let text = String(value ?? "")
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function toCsv(rows: unknown[][]): string {
  return "﻿" + rows.map((row) => row.map(cell).join(",")).join("\r\n")
}

export function csvResponse(filename: string, rows: unknown[][]): Response {
  return new Response(toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"` },
  })
}
