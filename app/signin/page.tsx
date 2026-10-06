import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { BrandMark } from "@/components/shell/brand"
import { ModeToggle } from "@/components/shell/mode-toggle"
import { env } from "@/lib/env"
import { getSession } from "@/server/context"
import { SignInCard } from "./signin-card"

export const metadata: Metadata = { title: "Sign in" }

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ upgrade?: string }> }) {
  const session = await getSession()
  const { upgrade } = await searchParams
  if (session && !(upgrade && session.user.isAnonymous)) redirect("/dashboard")
  const e = env()
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/30 p-6">
      <div className="absolute top-4 right-4">
        <ModeToggle />
      </div>
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <BrandMark /> {e.BRAND_NAME}
      </Link>
      <Suspense>
        <SignInCard googleEnabled={!!(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET)} devLogin={e.E2E} />
      </Suspense>
    </div>
  )
}
