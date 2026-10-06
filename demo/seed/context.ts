import type { Db } from "@/db/client"
import type { Jurisdiction } from "@/jurisdictions"
import type { IsoDate } from "@/lib/dates"
import type { Client } from "@/server/repos/clients"
import type { WorkspaceSettings } from "@/server/repos/workspace"
import type { ClientRole, Persona, ServiceRole } from "../personas"

/** Everything a seeding step needs; steps read persona data by role, never by position. */
export type SeedContext = {
  db: Db
  orgId: string
  userId: string
  today: IsoDate
  persona: Persona
  jurisdiction: Jurisdiction
  settings: WorkspaceSettings
  random: () => number
  accountId: (code: string) => string
  client: (role: ClientRole) => Client
  service: (role: ServiceRole) => Persona["services"][number]
}

/** Small deterministic PRNG so every demo of a jurisdiction looks the same. */
export function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Looks a role up and fails loudly when persona data lacks it (caught by the per-jurisdiction demo test). */
export function byRole<T extends { role?: string }>(items: T[], role: string, what: string): T {
  const found = items.find((i) => i.role === role)
  if (!found) throw new Error(`Demo persona has no ${what} with role "${role}"`)
  return found
}
