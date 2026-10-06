import {
  ArrowRightIcon,
  BellRingIcon,
  BookOpenCheckIcon,
  BriefcaseBusinessIcon,
  CompassIcon,
  FileTextIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UploadCloudIcon,
} from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { BrandMark } from "@/components/shell/brand"
import { ModeToggle } from "@/components/shell/mode-toggle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { env } from "@/lib/env"
import { getSession } from "@/server/context"
import { startDemo } from "@/server/actions/demo"

const DEMOS = [
  { code: "de", label: "Germany", currency: "€" },
  { code: "uk", label: "UK", currency: "£" },
  { code: "us", label: "USA", currency: "$" },
  { code: "je", label: "Jersey", currency: "£" },
] as const

const FEATURES = [
  { icon: FileTextIcon, title: "Invoices that pass the tax office", body: "§14 UStG, UK VAT, Jersey GST and US layouts — numbering, tax breakdown and service dates handled. Live PDF preview while you type." },
  { icon: UploadCloudIcon, title: "Bank imports without a bank login", body: "Drop the CSV or PDF from online banking. Columns are detected automatically; PDFs are read by AI and checked against the statement’s own balances." },
  { icon: SparklesIcon, title: "Bookkeeping that runs itself", body: "Rules and AI categorize every line into a tax-ready chart of accounts. You only confirm the uncertain ones — and teach it once." },
  { icon: BellRingIcon, title: "Know before it hurts", body: "Margin dropping, a record month, a VAT payment in nine days — you get a heads-up with the numbers, not after the fact." },
  { icon: BookOpenCheckIcon, title: "Month closed, in plain English", body: "A real P&L mapped to your tax return lines, a monthly close with a written summary, and an export your accountant will thank you for." },
  { icon: BriefcaseBusinessIcon, title: "Or hand it over completely", body: "Our bookkeepers take over the review queue and close your month — AI-first, human-checked, with every change audited." },
]

export default async function LandingPage() {
  if ((await getSession())?.user) redirect("/dashboard")
  const brand = env().BRAND_NAME
  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <BrandMark /> {brand}
          </Link>
          <div className="flex items-center gap-2">
            <ModeToggle />
            <Button asChild variant="ghost">
              <Link href="/signin">Sign in</Link>
            </Button>
            <Button asChild className="hidden sm:inline-flex">
              <Link href="/signin">Start free</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 -top-40 h-96 bg-[radial-gradient(ellipse_at_center,var(--color-primary)_0%,transparent_65%)] opacity-15" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:py-24 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <Badge variant="outline" className="mb-5 gap-1.5 py-1">
                <ShieldCheckIcon className="size-3.5 text-primary" /> Built for Germany, the UK, the US and Jersey
              </Badge>
              <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Know your cash. Get paid faster. Close every month.</h1>
              <p className="mt-5 max-w-xl text-lg text-muted-foreground text-pretty">
                Invoicing, bank-statement imports and AI bookkeeping in one calm place — free for small businesses, with expert help one click away when
                you need it.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href="/signin">
                    Start free with Google <ArrowRightIcon />
                  </Link>
                </Button>
              </div>
              {env().DEMO_ENABLED ? (
                <div className="mt-8">
                  <p className="mb-2 text-sm font-medium">Or explore a live demo business — no sign-up:</p>
                  <div className="flex flex-wrap gap-2">
                    {DEMOS.map((d) => (
                      <form key={d.code} action={startDemo.bind(null, d.code)}>
                        <Button variant="outline" size="sm">
                          {d.label} <span className="text-muted-foreground">{d.currency}</span>
                        </Button>
                      </form>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <ProductPreview />
          </div>
        </section>

        <section className="border-t bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <h2 className="max-w-2xl text-3xl font-semibold tracking-tight">Everything between “I sent the invoice” and “my books are done”.</h2>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <Card key={f.title} className="bg-background">
                  <CardHeader>
                    <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <f.icon className="size-5" />
                    </div>
                    <CardTitle className="text-base">{f.title}</CardTitle>
                    <CardDescription>{f.body}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-3xl font-semibold tracking-tight">Three steps. About ten minutes.</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              ["Set up your business", "Pick your country — currency, tax rules, deadlines and chart of accounts are configured for you."],
              ["Invoice & import", "Send your first compliant invoice, then drop last month’s bank export. Payments match invoices automatically."],
              ["Watch the numbers", "Your dashboard shows cash collected, expenses and margin — and tells you when it’s time to plan ahead."],
            ].map(([title, body], i) => (
              <li key={title} className="rounded-xl border p-6">
                <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{i + 1}</span>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t bg-muted/30">
          <div className="mx-auto grid max-w-6xl gap-4 px-4 py-20 md:grid-cols-3">
            <Offer title="Free" price="€0 / forever" points={["Unlimited invoices & clients", "Unlimited CSV imports", "10 AI PDF imports per month", "Dashboard, P&L and alerts"]} cta={<Link href="/signin">Start free</Link>} />
            <Offer
              highlight
              title="Done-for-you bookkeeping"
              price="Monthly, on request"
              points={["Named bookkeeper", "Review queue handled for you", "Monthly close with written summary", "Year-end pack for your accountant"]}
              cta={<Link href="/signin">Get started</Link>}
            />
            <Offer title="Strategic Cash-Flow & Growth Plan" price="Personal session" points={["Based on your real numbers", "Pricing, tax reserves, hiring", "12-month cash-flow forecast", "Concrete next steps"]} cta={<Link href="/signin">Request a plan</Link>} />
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <CompassIcon className="size-4" /> © {new Date().getFullYear()} {brand}
          </span>
          <nav className="flex gap-4">
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/impressum" className="hover:text-foreground">Impressum</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}

function Offer({ title, price, points, cta, highlight }: { title: string; price: string; points: string[]; cta: React.ReactNode; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary shadow-lg shadow-primary/10" : "bg-background"}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{price}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2 text-sm">
          {points.map((p) => (
            <li key={p} className="flex gap-2">
              <span className="text-primary">✓</span> {p}
            </li>
          ))}
        </ul>
        <Button asChild variant={highlight ? "default" : "outline"} className="w-full">
          {cta}
        </Button>
      </CardContent>
    </Card>
  )
}

/** Static illustration of the dashboard — no data, pure layout. */
function ProductPreview() {
  const bars = [38, 44, 41, 52, 49, 58, 63, 60, 71, 68, 79, 86]
  return (
    <div className="relative rounded-2xl border bg-card p-4 shadow-2xl shadow-primary/10">
      <div className="grid grid-cols-2 gap-3">
        {[
          ["Cash collected", "€48.210"],
          ["Net margin", "31 %"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex h-36 items-end gap-1.5 rounded-lg border p-3">
        {bars.map((h, i) => (
          <div key={i} className="flex h-full flex-1 items-end gap-0.5">
            <div className="flex-1 rounded-t-[3px] bg-chart-1" style={{ height: `${h}%` }} />
            <div className="flex-1 rounded-t-[3px] bg-chart-2" style={{ height: `${h * 0.62}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
        <div className="font-medium">🏆 You crossed €10.000 invoiced this month</div>
        <div className="mt-1 text-xs text-muted-foreground">A great moment to plan your next stage.</div>
      </div>
    </div>
  )
}
