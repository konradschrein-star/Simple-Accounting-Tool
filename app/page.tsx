import Link from "next/link"
import { BrandMark } from "@/components/shell/brand"
import { ModeToggle } from "@/components/shell/mode-toggle"
import { Button } from "@/components/ui/button"
import { env } from "@/lib/env"

export default function LandingPage() {
  return (
    <div className="min-h-svh">
      <header className="mx-auto flex max-w-6xl items-center justify-between p-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <BrandMark /> {env().BRAND_NAME}
        </Link>
        <div className="flex items-center gap-2">
          <ModeToggle />
          <Button asChild variant="outline">
            <Link href="/signin">Sign in</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Know your cash. Get paid faster.</h1>
        <p className="mt-4 text-muted-foreground">Invoicing, bank imports and AI bookkeeping for small businesses.</p>
        <Button asChild size="lg" className="mt-8">
          <Link href="/signin">Get started free</Link>
        </Button>
      </main>
    </div>
  )
}
