import fs from "node:fs"
import path from "node:path"
import { sql } from "drizzle-orm"
import { db } from "@/db/client"
import { env } from "@/lib/env"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    db.run(sql`select 1`)
    fs.accessSync(path.resolve(env().DATA_DIR), fs.constants.W_OK)
    return Response.json({ ok: true })
  } catch (error) {
    console.error("[health]", error)
    return Response.json({ ok: false }, { status: 503 })
  }
}
