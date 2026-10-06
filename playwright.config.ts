import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure" },
  projects: [
    { name: "light", use: { colorScheme: "light", viewport: { width: 1440, height: 1000 } } },
    { name: "dark", use: { colorScheme: "dark", viewport: { width: 1440, height: 1000 } } },
  ],
})
