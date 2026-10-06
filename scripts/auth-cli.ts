// Used only by `pnpm auth:generate` to emit the Better Auth Drizzle schema.
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin, anonymous, organization } from "better-auth/plugins"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"

export const auth = betterAuth({
  database: drizzleAdapter(drizzle(new Database(":memory:")), { provider: "sqlite" }),
  emailAndPassword: { enabled: true },
  plugins: [organization(), admin(), anonymous()],
})
