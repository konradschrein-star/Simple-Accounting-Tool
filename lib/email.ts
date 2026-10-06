import "server-only"
import { Resend } from "resend"
import { DomainError } from "@/lib/action-result"
import { env } from "@/lib/env"

export type OutgoingEmail = {
  to: string
  subject: string
  html: string
  replyTo?: string
  attachments?: { filename: string; content: Buffer }[]
}

export function emailConfigured(): boolean {
  const e = env()
  return !!(e.RESEND_API_KEY && e.EMAIL_FROM)
}

let client: Resend | undefined

/** Sends through Resend. Callers check `emailConfigured()` first; the UI falls back to share links otherwise. */
export async function sendEmail(message: OutgoingEmail): Promise<string> {
  const e = env()
  if (!e.RESEND_API_KEY || !e.EMAIL_FROM) throw new DomainError("Email sending is not set up yet — copy the invoice link instead.")
  client ??= new Resend(e.RESEND_API_KEY)
  const { data, error } = await client.emails.send({
    from: e.EMAIL_FROM,
    to: message.to,
    subject: message.subject,
    html: message.html,
    replyTo: message.replyTo,
    attachments: message.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
  })
  if (error || !data) throw new DomainError(`The email could not be sent: ${error?.message ?? "unknown error"}`)
  return data.id
}
