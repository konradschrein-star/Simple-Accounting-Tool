import Link from "next/link"
import { BrandMark } from "./brand"
import { ModeToggle } from "./mode-toggle"

export function LegalPage({ title, brand, children }: { title: string; brand: string; children: React.ReactNode }) {
  return (
    <div className="min-h-svh">
      <header className="mx-auto flex max-w-3xl items-center justify-between p-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <BrandMark /> {brand}
        </Link>
        <ModeToggle />
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 pb-16 text-sm leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {children}
      </main>
    </div>
  )
}
