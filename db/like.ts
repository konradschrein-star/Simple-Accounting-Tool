import { sql, type AnyColumn } from "drizzle-orm"

/** Case-insensitive "contains" with the user's `%`/`_` taken literally (SQLite LIKE needs an explicit ESCAPE). */
export function containsText(column: AnyColumn, query: string) {
  const pattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  return sql`${column} like ${pattern} escape ${"\\"}`
}
