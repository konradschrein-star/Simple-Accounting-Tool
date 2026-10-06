import { de } from "./de"
import { je } from "./je"
import { uk } from "./uk"
import { us } from "./us"
import type { Jurisdiction, JurisdictionCode } from "./types"

export * from "./types"

export const JURISDICTIONS: Record<JurisdictionCode, Jurisdiction> = { de, uk, us, je }

export function getJurisdiction(code: JurisdictionCode): Jurisdiction {
  return JURISDICTIONS[code]
}
