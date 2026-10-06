import "server-only"
import fs from "node:fs"
import path from "node:path"
import { Font, renderToBuffer } from "@react-pdf/renderer"
import { createElement, type ReactElement } from "react"
import type { DocumentProps } from "@react-pdf/renderer"
import { env } from "@/lib/env"
import { InvoiceDocument, type InvoiceDocumentProps } from "./InvoiceDocument"

let fontsRegistered = false

/** Noto Sans covers €, £, umlauts and ß; registered from an absolute path so it works in the standalone build. */
export function ensureFonts() {
  if (fontsRegistered) return
  const dir = path.join(process.cwd(), "assets", "fonts")
  Font.register({
    family: "Noto Sans",
    fonts: [
      { src: path.join(dir, "NotoSans-Regular.ttf"), fontWeight: 400 },
      { src: path.join(dir, "NotoSans-Bold.ttf"), fontWeight: 700 },
    ],
  })
  Font.registerHyphenationCallback((word) => [word])
  fontsRegistered = true
}

export function loadLogo(logoPath: string | null): InvoiceDocumentProps["logo"] {
  if (!logoPath) return null
  const file = path.join(path.resolve(env().DATA_DIR), logoPath)
  if (!fs.existsSync(file)) return null
  return { data: fs.readFileSync(file), format: logoPath.endsWith(".png") ? "png" : "jpg" }
}

export async function renderPdf(element: ReactElement<DocumentProps>): Promise<Buffer> {
  ensureFonts()
  return renderToBuffer(element)
}

export async function renderInvoicePdf(props: Omit<InvoiceDocumentProps, "logo">): Promise<Buffer> {
  return renderPdf(createElement(InvoiceDocument, { ...props, logo: loadLogo(props.snapshot.logoPath) }) as ReactElement<DocumentProps>)
}
