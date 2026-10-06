/** In-memory token buckets — sufficient for a single-process deployment. */
const buckets = new Map<string, { tokens: number; updated: number }>()
/** Keys are caller-controlled; cap the map so a flood of unique keys can't exhaust memory. */
const MAX_BUCKETS = 50_000

function takeToken(key: string, capacity: number, refillPerMs: number): boolean {
  const now = Date.now()
  const bucket = buckets.get(key) ?? { tokens: capacity, updated: now }
  bucket.tokens = Math.min(capacity, bucket.tokens + (now - bucket.updated) * refillPerMs)
  bucket.updated = now
  const allowed = bucket.tokens >= 1
  if (allowed) bucket.tokens -= 1
  // Re-insert so the map's insertion order is least-recently-used first, then evict the oldest beyond the cap.
  buckets.delete(key)
  buckets.set(key, bucket)
  if (buckets.size > MAX_BUCKETS) buckets.delete(buckets.keys().next().value!)
  return allowed
}

export const limits = {
  upload: (userId: string) => takeToken(`upload:${userId}`, 5, 5 / 60_000),
  cta: (userId: string) => takeToken(`cta:${userId}`, 3, 3 / 3_600_000),
  /** Paid model calls outside the PDF quota (categorization reruns, rules, month summaries). */
  llm: (orgId: string) => takeToken(`llm:${orgId}`, 10, 10 / 3_600_000),
  /** Each receipt is one small AI read; generous enough for a shoebox of receipts at month end. */
  receipts: (orgId: string) => takeToken(`receipts:${orgId}`, 60, 60 / 3_600_000),
  /** Outgoing email per workspace (documents and reminders) — protects the sender domain's reputation. */
  email: (orgId: string) => takeToken(`email:${orgId}`, 20, 20 / 3_600_000),
  /** Public pages by client IP — the token itself is checked for shape before it ever becomes a key. */
  publicLink: (ip: string) => takeToken(`public:${ip}`, 30, 30 / 3_600_000),
  demo: (ip: string) => (process.env.NODE_ENV === "production" ? takeToken(`demo:${ip}`, 3, 3 / 3_600_000) : true),
}
