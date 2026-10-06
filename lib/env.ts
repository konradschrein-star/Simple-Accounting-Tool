import { z } from "zod"

const bool = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1")

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATA_DIR: z.string().default("./data"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  ADMIN_EMAILS: z
    .string()
    .default("")
    .transform((s) =>
      s
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    ),
  BRAND_NAME: z.string().default("Cashflow Compass"),
  BOOKING_URL: z.string().url().optional(),
  LEAD_WEBHOOK_URL: z.string().url().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  /** e.g. "Studio Billing <billing@your-domain.com>" — the domain must be verified in Resend. */
  EMAIL_FROM: z.string().optional(),
  LLM_TEXT_MODEL: z.string().default("deepseek/deepseek-v4.1-flash"),
  LLM_VISION_MODEL: z.string().default("qwen/qwen3-vl-30b-a3b-instruct"),
  LLM_ESCALATION_MODEL: z.string().default("qwen/qwen3-vl-235b-a22b-instruct"),
  PDF_IMPORTS_PER_MONTH: z.coerce.number().int().default(10),
  MAX_PDF_PAGES: z.coerce.number().int().default(30),
  DELETE_SOURCE_AFTER_COMMIT: bool.default(true),
  MARGIN_ALERT_BP: z.coerce.number().int().default(2500),
  AI_AUTO_ACCEPT: z.coerce.number().min(0).max(1).default(0.85),
  DEMO_ENABLED: bool.default(true),
  DEMO_TTL_HOURS: z.coerce.number().int().default(24),
  OPERATOR_NAME: z.string().default(""),
  OPERATOR_ADDRESS: z.string().default(""),
  OPERATOR_EMAIL: z.string().default(""),
  E2E: bool.default(false),
})

export type Env = z.infer<typeof schema>

let cached: Env | undefined

/** Parsed environment. Lazy so that `next build` never needs runtime secrets. */
export function env(): Env {
  if (cached) return cached
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`)
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.E2E) {
    throw new Error("E2E=1 must never be enabled in production")
  }
  cached = parsed.data
  return cached
}
