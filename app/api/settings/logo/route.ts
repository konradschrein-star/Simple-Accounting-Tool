import fs from "node:fs"
import path from "node:path"
import { revalidatePath } from "next/cache"
import { db } from "@/db/client"
import { env } from "@/lib/env"
import { audit, requireReadyOrg } from "@/server/context"
import { updateSettings } from "@/server/repos/workspace"

const MAX_BYTES = 1024 * 1024

function sniffImage(bytes: Uint8Array): "png" | "jpg" | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png"
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg"
  return null
}

export async function POST(request: Request) {
  const ctx = await requireReadyOrg()
  const file = (await request.formData()).get("logo")
  if (!(file instanceof File)) return Response.json({ error: "No file uploaded" }, { status: 400 })
  if (file.size > MAX_BYTES) return Response.json({ error: "Logo must be under 1 MB" }, { status: 413 })
  const bytes = new Uint8Array(await file.arrayBuffer())
  const ext = sniffImage(bytes)
  if (!ext) return Response.json({ error: "Upload a PNG or JPG image" }, { status: 415 })

  const relative = path.join("uploads", ctx.orgId, `logo-${Date.now()}.${ext}`)
  const absolute = path.join(path.resolve(env().DATA_DIR), relative)
  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  fs.writeFileSync(absolute, bytes)
  if (ctx.settings.logoPath) fs.rmSync(path.join(path.resolve(env().DATA_DIR), ctx.settings.logoPath), { force: true })
  updateSettings(db, ctx.orgId, { logoPath: relative })
  audit(ctx, "settings.logo_uploaded", "workspace", ctx.orgId)
  revalidatePath("/settings")
  return Response.json({ ok: true })
}

export async function GET() {
  const ctx = await requireReadyOrg()
  if (!ctx.settings.logoPath) return new Response(null, { status: 404 })
  const file = path.join(path.resolve(env().DATA_DIR), ctx.settings.logoPath)
  if (!fs.existsSync(file)) return new Response(null, { status: 404 })
  return new Response(new Uint8Array(fs.readFileSync(file)), {
    headers: { "Content-Type": file.endsWith(".png") ? "image/png" : "image/jpeg", "Cache-Control": "private, max-age=60" },
  })
}
