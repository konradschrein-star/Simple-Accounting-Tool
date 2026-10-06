import { headers } from "next/headers"

/**
 * The visitor's IP as Caddy reports it. Caddy replaces any X-Forwarded-For the client sends (no trusted proxies are
 * configured), so the value can't be spoofed in production; locally there is no proxy and everyone is "local".
 */
export async function clientIp(): Promise<string> {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local"
}
