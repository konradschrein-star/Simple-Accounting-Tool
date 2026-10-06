import { headers } from "next/headers"

/**
 * The visitor's IP as the reverse proxy reports it. Caddy and deploy/nginx.conf both replace any X-Forwarded-For the
 * client sends, so the value can't be spoofed in production; locally there is no proxy and everyone is "local".
 */
export async function clientIp(): Promise<string> {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local"
}
