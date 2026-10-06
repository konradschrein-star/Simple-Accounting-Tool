import { BriefcaseBusinessIcon, FlaskConicalIcon } from "lucide-react"
import Link from "next/link"
import { AppSidebar, type ShellRole } from "@/components/shell/app-sidebar"
import { ModeToggle } from "@/components/shell/mode-toggle"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { db } from "@/db/client"
import { env } from "@/lib/env"
import { requireReadyOrg } from "@/server/context"
import { countNeedsReview } from "@/server/repos/ledger"
import { exitClientWorkspace } from "@/server/actions/console"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireReadyOrg()
  const role: ShellRole = ctx.user.role === "admin" ? "admin" : ctx.user.role === "staff" ? "staff" : "user"
  const reviewCount = countNeedsReview(db, ctx.orgId)

  return (
    <SidebarProvider>
      <AppSidebar brandName={env().BRAND_NAME} orgName={ctx.orgName} user={ctx.user} role={role} reviewCount={reviewCount} />
      <SidebarInset>
        {ctx.actor === "staff" ? (
          <div className="flex items-center justify-between gap-3 bg-primary px-4 py-2 text-sm text-primary-foreground">
            <span className="flex items-center gap-2">
              <BriefcaseBusinessIcon className="size-4" /> Acting as bookkeeper for <strong>{ctx.orgName}</strong> — every change is audited.
            </span>
            <form action={exitClientWorkspace}>
              <Button size="sm" variant="secondary">Exit client</Button>
            </form>
          </div>
        ) : null}
        {ctx.settings.isDemo ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-warning/15 px-4 py-2 text-sm">
            <span className="flex items-center gap-2">
              <FlaskConicalIcon className="size-4" /> Demo workspace with sample data — it resets automatically within {env().DEMO_TTL_HOURS}h.
            </span>
            <Button size="sm" variant="outline" asChild>
              <Link href="/signin?upgrade=1">Sign in with Google to keep your own</Link>
            </Button>
          </div>
        ) : null}
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
          <span className="truncate text-sm text-muted-foreground">
            {ctx.orgName} · {ctx.jurisdiction.name} · {ctx.settings.currency}
          </span>
          <div className="ml-auto">
            <ModeToggle />
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
