import fs from "node:fs"
import path from "node:path"
import { dataPath } from "./data-path"

type UploadArea = "imports" | "receipts"

/** Where an upload lives, relative to DATA_DIR — the value the database stores. */
export const uploadPath = (orgId: string, area: UploadArea, id: string, ext: string) => path.join("uploads", orgId, area, `${id}.${ext}`)

export function writeUpload(relative: string, bytes: Uint8Array) {
  fs.mkdirSync(path.dirname(dataPath(relative)), { recursive: true })
  fs.writeFileSync(dataPath(relative), bytes)
}

/** Writes an upload to its place and returns the relative path. */
export function storeUpload(orgId: string, area: UploadArea, id: string, ext: string, bytes: Uint8Array): string {
  const relative = uploadPath(orgId, area, id, ext)
  writeUpload(relative, bytes)
  return relative
}

export function removeUpload(relative: string) {
  fs.rmSync(dataPath(relative), { force: true })
}
