import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { BrandMark } from "@/components/shell/brand"
import { ModeToggle } from "@/components/shell/mode-toggle"
import { requireOrg } from "@/server/context"
import { OnboardingForm } from "./onboarding-form"

export const metadata: Metadata = { title: "Set up your workspace" }

export default async function OnboardingPage() {
  const ctx = await requireOrg()
  if (ctx.jurisdiction) redirect("/dashboard")
  return (
    <div className="min-h-svh bg-muted/30">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div>
              <h1 className="text-xl font-semibold">Welcome{ctx.user.name ? `, ${ctx.user.name.split(" ")[0]}` : ""} 👋</h1>
              <p className="text-sm text-muted-foreground">Two minutes to a compliant invoicing and cash-flow workspace.</p>
            </div>
          </div>
          <ModeToggle />
        </div>
        <OnboardingForm defaultName={ctx.orgName.endsWith("'s business") ? "" : ctx.orgName} defaultEmail={ctx.user.email} />
      </div>
    </div>
  )
}
