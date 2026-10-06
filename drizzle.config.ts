import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "sqlite",
  schema: "./db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: `${process.env.DATA_DIR ?? "./data"}/db/app.db` },
})
