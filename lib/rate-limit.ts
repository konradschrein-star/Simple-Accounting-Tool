/** In-memory token bucket — sufficient for a single-process deployment. */
const buckets = new Map<string, { tokens: number; updated: number }>()

function takeToken(key: string, capacity: number, refillPerMs: number): boolean {
  const now = Date.now()
  const bucket = buckets.get(key) ?? { tokens: capacity, updated: now }
  bucket.tokens = Math.min(capacity, bucket.tokens + (now - bucket.updated) * refillPerMs)
  bucket.updated = now
  const allowed = bucket.tokens >= 1
  if (allowed) bucket.tokens -= 1
  buckets.set(key, bucket)
  return allowed
}

export const limits = {
  upload: (userId: string) => takeToken(`upload:${userId}`, 5, 5 / 60_000),
  cta: (userId: string) => takeToken(`cta:${userId}`, 3, 3 / 3_600_000),
  /** Paid model calls outside the PDF quota (categorization reruns, rules, month summaries). */
  llm: (orgId: string) => takeToken(`llm:${orgId}`, 10, 10 / 3_600_000),
  publicLink: (token: string) => takeToken(`public:${token}`, 5, 5 / 3_600_000),
  demo: (ip: string) => (process.env.NODE_ENV === "production" ? takeToken(`demo:${ip}`, 3, 3 / 3_600_000) : true),
}
