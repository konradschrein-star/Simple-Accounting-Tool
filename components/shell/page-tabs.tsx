import Link from "next/link"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type TabDef<K extends string> = readonly (readonly [K, string])[]

/** The requested tab when it exists, otherwise the first one. */
export function parseTab<K extends string>(tabs: TabDef<K>, value: string | undefined): K {
  return tabs.find(([key]) => key === value)?.[0] ?? tabs[0][0]
}

/** Underlined section tabs driven by `?tab=`. */
export function PageTabs<K extends string>({ basePath, tabs, current }: { basePath: string; tabs: TabDef<K>; current: K }) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Sections">
      {tabs.map(([key, label]) => (
        <Link
          key={key}
          href={`${basePath}?tab=${key}`}
          aria-current={current === key ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap",
            current === key ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}

/** A row of link "chips" for filters such as status, range or month. */
export function FilterLinks({
  items,
  current,
  className,
}: {
  items: { key: string; href: string; label: React.ReactNode }[]
  current: string
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {items.map((item) => (
        <Button key={item.key} asChild size="sm" variant={item.key === current ? "secondary" : "ghost"}>
          <Link href={item.href} aria-current={item.key === current ? "page" : undefined}>
            {item.label}
          </Link>
        </Button>
      ))}
    </div>
  )
}
