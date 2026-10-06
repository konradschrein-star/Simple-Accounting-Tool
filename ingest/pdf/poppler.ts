import { execFile } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"

const run = promisify(execFile)

export class PdfError extends Error {
  constructor(
    readonly code: "ENCRYPTED_PDF" | "TOO_MANY_PAGES" | "UNSUPPORTED_TYPE" | "PDF_TOOLING_UNAVAILABLE",
    message: string,
  ) {
    super(message)
  }
}

async function tool(name: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await run(name, args, { maxBuffer: 64 * 1024 * 1024, timeout: 60_000, encoding: "utf8" })
    return stdout
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: string }
    if (err.code === "ENOENT") throw new PdfError("PDF_TOOLING_UNAVAILABLE", `${name} is not installed (poppler-utils)`)
    if (/incorrect password|encrypted/i.test(err.stderr ?? "")) throw new PdfError("ENCRYPTED_PDF", "The PDF is password-protected")
    throw new PdfError("UNSUPPORTED_TYPE", `Could not read PDF: ${err.stderr || err.message}`)
  }
}

export async function pdfInfo(file: string): Promise<{ pages: number; encrypted: boolean }> {
  const out = await tool("pdfinfo", [file])
  return { pages: Number(/^Pages:\s+(\d+)/m.exec(out)?.[1] ?? 0), encrypted: /^Encrypted:\s+yes/m.test(out) }
}

/** Text layer per page (pdftotext separates pages with form feeds). */
export async function pdfPageTexts(file: string): Promise<string[]> {
  const out = await tool("pdftotext", ["-layout", "-enc", "UTF-8", file, "-"])
  return out.split("\f").slice(0, -1).map((page) => page.replace(/[ \t]+$/gm, ""))
}

export async function pdfPageImages(file: string, pages: number, dpi = 150): Promise<Buffer[]> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stmt-"))
  try {
    await tool("pdftoppm", ["-r", String(dpi), "-png", "-l", String(pages), file, path.join(dir, "p")])
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".png"))
      .sort()
      .map((f) => fs.readFileSync(path.join(dir, f)))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

export function meaningfulChars(text: string): number {
  return text.replace(/\s+/g, "").length
}
