import type { Db } from "@/db/client"

/** Re-evaluates advisory triggers for a workspace. Implemented in the advisory step; called from every money-moving mutation. */
export function evaluateTriggers(_db: Db, _orgId: string): void {}
