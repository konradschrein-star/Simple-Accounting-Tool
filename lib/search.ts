import type { SearchResults } from "@/server/repos/search"

/** Shared by the command menu (client) and the search action (server). */
export const MIN_QUERY_LENGTH = 2
export const EMPTY_RESULTS: SearchResults = { documents: [], clients: [], transactions: [] }
