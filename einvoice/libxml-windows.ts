import fs from "node:fs"
import { xmlRegisterInputProvider } from "libxml2-wasm"

/**
 * libxml2-wasm's file provider parses "C:/…" as a URL with scheme "c:" and refuses it, so schema includes
 * fail on Windows dev machines (Linux, where the app runs, is unaffected). Teach it plain drive-letter paths.
 */
if (process.platform === "win32") {
  const isDrivePath = (name: string) => /^[A-Za-z]:[\\/]/.test(name)
  xmlRegisterInputProvider({
    match: (name) => isDrivePath(name) && fs.existsSync(name),
    open: (name) => {
      try {
        return fs.openSync(name, "r")
      } catch {
        return undefined
      }
    },
    read: (fd, buf) => {
      try {
        return fs.readSync(fd, buf, 0, buf.byteLength, null)
      } catch {
        return -1
      }
    },
    close: (fd) => {
      try {
        fs.closeSync(fd)
      } catch {
        // already closed
      }
      return true
    },
  })
}
