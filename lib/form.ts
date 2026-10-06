import { z } from "zod"

/** HTML checkbox / Radix switch value in FormData. */
export const checkbox = z.preprocess((v) => v === "on" || v === "true", z.boolean())
export const text = (max = 200) => z.string().trim().max(max).default("")
