import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "@react-pdf/renderer"],
  outputFileTracingIncludes: { "/*": ["./drizzle/**/*", "./assets/**/*"] },
  poweredByHeader: false,
}

export default nextConfig
