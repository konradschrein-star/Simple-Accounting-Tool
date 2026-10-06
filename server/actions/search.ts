"use server"

import { db } from "@/db/client"
import { requireReadyOrg } from "@/server/context"
import { searchWorkspace, type SearchResults } from "@/server/repos/search"

const EMPTY: SearchResults = { documents: [], clients: [], transactions: [] }

export async function commandSearch(query: string): Promise<SearchResults> {
  const ctx = await requireReadyOrg()
  const q = String(query ?? "")
    .trim()
    .slice(0, 80)
  return q.length < 2 ? EMPTY : searchWorkspace(db, ctx.orgId, q)
}
