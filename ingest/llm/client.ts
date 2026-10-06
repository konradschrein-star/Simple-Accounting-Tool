import OpenAI, { APIConnectionTimeoutError, APIError } from "openai"
import type { ChatCompletionContentPart, ChatCompletionCreateParamsNonStreaming, ChatCompletionMessageParam } from "openai/resources/chat/completions"
import type { ResponseFormatJSONObject, ResponseFormatJSONSchema } from "openai/resources/shared"
import { z } from "zod"
import { env } from "@/lib/env"

export class LlmError extends Error {
  constructor(
    readonly code: "LLM_UNAVAILABLE" | "LLM_TIMEOUT" | "LLM_INVALID_OUTPUT",
    message: string,
  ) {
    super(message)
  }
}

export type LlmContent = string | ChatCompletionContentPart[]

/** Minimal port so tests (and the demo) can swap in a fake model. */
export type LlmPort = <T>(request: StructuredRequest<T>) => Promise<{ data: T; model: string }>

export type StructuredRequest<T> = {
  model: string
  name: string
  schema: z.ZodType<T>
  system: string
  user: LlmContent
  maxTokens?: number
}

let client: OpenAI | undefined
function openRouter(): OpenAI {
  const key = env().OPENROUTER_API_KEY
  if (!key) throw new LlmError("LLM_UNAVAILABLE", "OPENROUTER_API_KEY is not configured")
  client ??= new OpenAI({
    apiKey: key,
    baseURL: "https://openrouter.ai/api/v1",
    timeout: 90_000,
    maxRetries: 1,
    defaultHeaders: { "X-Title": env().BRAND_NAME },
  })
  return client
}

/** OpenAI-style strict schemas need every property required and no additional properties. */
export function strictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(visit)
    if (!node || typeof node !== "object") return node
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node)) if (k !== "$schema") out[k] = visit(v)
    if (out.type === "object" && out.properties) {
      out.additionalProperties = false
      out.required = Object.keys(out.properties as object)
    }
    return out
  }
  return visit(z.toJSONSchema(schema, { target: "draft-7" })) as Record<string, unknown>
}

function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const body = (fenced ? fenced[1] : text).trim()
  return JSON.parse(body.slice(body.search(/[[{]/)))
}

/**
 * Structured completion through OpenRouter, restricted to zero-data-retention endpoints.
 * Strict json_schema first; one repair round-trip with the validation error; json_object mode as a fallback
 * for providers that ignore schemas.
 */
/** OpenRouter routing preferences: zero-data-retention endpoints only, cheapest first. */
type OpenRouterParams = ChatCompletionCreateParamsNonStreaming & {
  provider: { zdr: boolean; data_collection: "deny"; require_parameters: boolean; sort: "price" }
}

export const openRouterStructured: LlmPort = async <T>(request: StructuredRequest<T>) => {
  const api = openRouter()
  const strict: ResponseFormatJSONSchema = { type: "json_schema", json_schema: { name: request.name, strict: true, schema: strictJsonSchema(request.schema) } }
  const loose: ResponseFormatJSONObject = { type: "json_object" }

  let lastError = "no response"
  for (const response_format of [strict, loose]) {
    // Fresh conversation per format so repair turns from one mode never leak into the next.
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: request.system },
      { role: "user", content: request.user },
    ]
    for (let attempt = 0; attempt < 2; attempt++) {
      const params: OpenRouterParams = {
        model: request.model,
        messages,
        temperature: 0,
        max_tokens: request.maxTokens ?? 8000,
        response_format,
        provider: { zdr: true, data_collection: "deny", require_parameters: true, sort: "price" },
      }
      let completion
      try {
        completion = await api.chat.completions.create(params)
      } catch (error) {
        if (error instanceof APIConnectionTimeoutError) throw new LlmError("LLM_TIMEOUT", error.message)
        // 404: no endpoint supports this mode (e.g. strict schemas) — try the next format.
        if (error instanceof APIError && error.status === 404) {
          lastError = error.message
          break
        }
        throw new LlmError("LLM_UNAVAILABLE", error instanceof Error ? error.message : String(error))
      }
      const text = completion.choices[0]?.message?.content ?? ""
      try {
        const parsed = request.schema.safeParse(extractJson(text))
        if (parsed.success) return { data: parsed.data, model: completion.model ?? request.model }
        lastError = z.prettifyError(parsed.error)
      } catch (error) {
        lastError = `Response was not JSON: ${String(error)}`
      }
      if (attempt === 0) messages.push({ role: "assistant", content: text }, { role: "user", content: `That output was invalid:\n${lastError}\nReturn only corrected JSON matching the schema.` })
    }
  }
  throw new LlmError("LLM_INVALID_OUTPUT", lastError)
}

/** The configured model gateway, or null when AI is not set up — callers then fall back to deterministic behaviour. */
export function defaultLlm(): LlmPort | null {
  return env().OPENROUTER_API_KEY ? openRouterStructured : null
}

export function imagePart(image: Buffer, mimeType: "image/png" | "image/jpeg" = "image/png"): ChatCompletionContentPart {
  return { type: "image_url", image_url: { url: `data:${mimeType};base64,${image.toString("base64")}` } }
}
