import type { Metadata } from "next"
import { LegalPage } from "@/components/shell/legal-page"
import { env } from "@/lib/env"

export const metadata: Metadata = { title: "Impressum" }

export default function ImpressumPage() {
  const e = env()
  return (
    <LegalPage title="Impressum" brand={e.BRAND_NAME}>
      <p className="text-muted-foreground">Angaben gemäß § 5 DDG</p>
      <p className="whitespace-pre-line">
        {e.OPERATOR_NAME || "[Operator name]"}
        {"\n"}
        {e.OPERATOR_ADDRESS || "[Address]"}
      </p>
      <p>E-Mail: {e.OPERATOR_EMAIL || "[email]"}</p>
      <p className="text-muted-foreground">Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV: {e.OPERATOR_NAME || "[Operator name]"}</p>
    </LegalPage>
  )
}
