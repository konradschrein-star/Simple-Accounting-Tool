import type { Metadata } from "next"
import { LegalPage } from "@/components/shell/legal-page"
import { env } from "@/lib/env"

export const metadata: Metadata = { title: "Privacy" }

export default function PrivacyPage() {
  const e = env()
  return (
    <LegalPage title="Privacy policy" brand={e.BRAND_NAME}>
      <p>
        {e.BRAND_NAME} is operated by {e.OPERATOR_NAME || "the operator named in the Impressum"}. We process your data to provide invoicing, bank-statement
        import, bookkeeping and cash-flow features (Art. 6(1)(b) GDPR / UK GDPR), and — only with your consent — to offer advisory services.
      </p>
      <h2>What we store</h2>
      <p>Your account (name, email via Google sign-in), business profile, clients, invoices, imported bank transactions and the categorization you apply. Everything is stored on our own server in the EU and is never sold.</p>
      <h2>AI processing of statements</h2>
      <p>
        When you upload a PDF statement or use AI categorization, the relevant text or page images are sent to AI models via OpenRouter, Inc. (sub-processor).
        We only route to endpoints with a zero-data-retention policy: the providers process the request and do not store it or use it for training. Uploaded
        source files are deleted after you book the import.
      </p>
      <h2>Advisory opt-in</h2>
      <p>If you switch on “Share summary metrics with advisors” or request a plan or bookkeeping, our team sees summary figures (revenue, cash collected, expenses, margin) to contact you. Bookkeepers only access your workspace after you explicitly consent, and every change they make is logged.</p>
      <h2>Retention & your rights</h2>
      <p>You can export all your data or delete your workspace at any time under Settings. Backups are kept for 14 days. You have the right to access, rectification, erasure, restriction, portability and objection, and to complain to a supervisory authority. Contact: {e.OPERATOR_EMAIL || "see Impressum"}.</p>
      <h2>Cookies</h2>
      <p>We only use a strictly necessary session cookie to keep you signed in. No tracking or advertising cookies.</p>
    </LegalPage>
  )
}
