import path from "node:path"
import { env } from "@/lib/env"

/** Absolute path for a DATA_DIR-relative file, refusing anything that escapes the data directory. */
export function dataPath(relative: string): string {
  const root = path.resolve(env().DATA_DIR)
  const absolute = path.resolve(root, relative)
  if (absolute !== root && !absolute.startsWith(root + path.sep)) throw new Error("Path escapes data directory")
  return absolute
}
