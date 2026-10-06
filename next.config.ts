import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "@react-pdf/renderer", "@stafyniaksacha/facturx", "libxml2-wasm", "saxon-js", "pdf-lib"],
  outputFileTracingIncludes: {
    "/*": ["./drizzle/**/*", "./assets/**/*"],
    // XSDs and the wasm binary are read from disk at runtime, invisible to the tracer.
    "/api/invoices/**": ["./node_modules/@stafyniaksacha/facturx/dist/**/*", "./node_modules/libxml2-wasm/lib/**/*"],
  },
  poweredByHeader: false,
}

export default nextConfig
