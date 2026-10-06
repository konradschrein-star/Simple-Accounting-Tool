"use server"

import { z } from "zod"
import { db } from "@/db/client"
import { requireReadyOrg } from "@/server/context"
import { EMPTY_RESULTS, MIN_QUERY_LENGTH } from "@/lib/search"
import { searchWorkspace, type SearchResults } from "@/server/repos/search"

const searchQuery = z.string().trim().max(80).catch("")

export async function commandSearch(query: unknown): Promise<SearchResults> {
  const ctx = await requireReadyOrg()
  const q = searchQuery.parse(query)
  return q.length < MIN_QUERY_LENGTH ? EMPTY_RESULTS : searchWorkspace(db, ctx.orgId, q)
}
