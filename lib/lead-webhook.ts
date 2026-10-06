import { env } from "@/lib/env"

/** Best-effort notification (Slack/Make/n8n). Never blocks or fails the user's request. */
export function notifyLead(event: Record<string, unknown>) {
  const url = env().LEAD_WEBHOOK_URL
  if (!url) return
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: env().BRAND_NAME, at: new Date().toISOString(), ...event }),
    signal: AbortSignal.timeout(5000),
  }).catch((error) => console.warn("[lead-webhook] failed:", error instanceof Error ? error.message : error))
}
