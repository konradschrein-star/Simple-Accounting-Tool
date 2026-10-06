import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { admin, anonymous, organization } from "better-auth/plugins"
import { db } from "@/db/client"
import * as schema from "@/db/schema"
import { firstMembershipOrgId } from "@/server/repos/workspace"
import { env } from "@/lib/env"

function createAuth() {
  const e = env()
  return betterAuth({
    appName: e.BRAND_NAME,
    baseURL: e.BETTER_AUTH_URL,
    secret: e.BETTER_AUTH_SECRET,
    trustedOrigins: [e.BETTER_AUTH_URL],
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    emailAndPassword: { enabled: e.E2E },
    socialProviders:
      e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET, prompt: "select_account" } }
        : {},
    rateLimit: { enabled: true, storage: "memory" },
    // Guests are only created server-side by the demo flow; role changes go through our audited admin UI.
    disabledPaths: [
      "/sign-in/anonymous",
      "/admin/impersonate-user",
      "/admin/stop-impersonating",
      "/admin/set-role",
      "/admin/create-user",
      "/admin/remove-user",
      "/admin/set-user-password",
      "/admin/ban-user",
      "/admin/unban-user",
      "/admin/update-user",
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (user) => ({
            data: { ...user, role: e.ADMIN_EMAILS.includes(user.email.toLowerCase()) ? "admin" : "user" },
          }),
        },
      },
      session: {
        create: {
          // Every session starts in the user's first workspace; requireOrg() bootstraps one if none exists yet.
          before: async (session) => {
            return { data: { ...session, activeOrganizationId: firstMembershipOrgId(db, session.userId) } }
          },
        },
      },
    },
    plugins: [
      organization({ allowUserToCreateOrganization: false }),
      admin({ defaultRole: "user", adminRoles: ["admin"] }),
      anonymous({ emailDomainName: "demo.invalid" }),
      nextCookies(),
    ],
  })
}

type Auth = ReturnType<typeof createAuth>
let instance: Auth | undefined

/** Lazily constructed so that importing this module never touches env or the database. */
export function getAuth(): Auth {
  instance ??= createAuth()
  return instance
}
