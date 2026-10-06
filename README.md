# Cashflow Compass

Self-hosted, multi-tenant invoicing, bank-statement ingestion, AI bookkeeping and cash-flow advisory for small businesses in **Germany, the UK, the US and Jersey** — a free product that qualifies leads for a strategic planning offer and a done-for-you bookkeeping service.

- **Invoicing**: invoices, quotes and credit notes (Stornorechnung) with compliant PDFs (§14 UStG, UK VAT, Jersey GST, US), gap-free numbering per kind, live preview, product catalog, line discounts, multi-currency with the ECB rate locked at finalize, part payments, recurring invoices, email sending and dunning reminders (Resend), public share links where clients pay or accept quotes.
- **E-invoicing**: ZUGFeRD 2 / Factur-X (EN 16931) PDFs and XRechnung XML, validated in tests against the official XSD and Schematron.
- **Bank imports without Plaid**: CAMT.053 and OFX (exact), CSV with automatic column detection (Sparkasse, DKB, N26, Monzo, Barclays, Chase…) and PDF statements read by open-weight models (via OpenRouter, zero-data-retention only), verified against the statement's own balances. Payments are matched to invoices by reference or exact open amount.
- **Receipts**: upload PDFs/photos, AI reads vendor, total and VAT, and suggests the bank payment; the receipt's VAT rate feeds the return.
- **Tax**: UStVA (Kz 81/86/66/83), UK 9-box VAT, Jersey GST and US sales-tax summaries — accrual or cash accounting, filing deadlines per jurisdiction.
- **AI bookkeeping**: heuristics → rules → AI categorization into country-specific charts of accounts mapped to tax-return lines, review queue with confidence, rule learning, monthly close with written summary, P&L + CSV export, audit log.
- **Advisory triggers**: €/£/$10k milestones, margin below 25 %, upcoming tax deadlines → “Request a Strategic Cash-Flow & Growth Plan”.
- **Team**: admin lead list (opt-in only), bookkeeper console with consent-gated client access.
- **Overview**: cash position, burn and runway, 30-day outlook, spending by category, ⌘K command menu.
- **Demo**: one-click seeded sandbox per country, auto-deleted after 24 h.

Stack: Next.js 16 (App Router) · TypeScript · SQLite (WAL) + Drizzle · Better Auth (Google) · shadcn/ui (light/dark) · @react-pdf/renderer · poppler · Docker Compose + Caddy.

## Local development

```bash
pnpm install
cp .env.example .env.local      # set BETTER_AUTH_SECRET, DATA_DIR=./data, BETTER_AUTH_URL=http://localhost:3000, E2E=1
pnpm db:migrate
pnpm dev                         # http://localhost:3000 — test login available when E2E=1
pnpm test                        # unit + integration (vitest)
pnpm test:e2e                    # Playwright smoke test (needs `pnpm dev` running with E2E=1)
```

PDF statement import needs `poppler-utils` (`pdftotext`, `pdftoppm`, `pdfinfo`) on the PATH — included in the Docker image.

Optional integrations (everything works without them, with graceful fallbacks):

| Variable | Enables |
|---|---|
| `OPENROUTER_API_KEY` | PDF statement reading, AI categorization, receipt reading, month summaries |
| `RESEND_API_KEY`, `EMAIL_FROM` | Sending invoices/quotes by email and automatic payment reminders (otherwise: share links) |
| `LEAD_WEBHOOK_URL` | Posting advisory/bookkeeping requests to your CRM |

## Deploy to a VPS (Ubuntu)

1. **Prepare the server**
   ```bash
   curl -fsSL https://get.docker.com | sh
   ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
   ```
2. **Get the code & configure**
   ```bash
   git clone <repo> /opt/cashflow && cd /opt/cashflow
   cp .env.example .env && nano .env   # APP_HOST=<ip-with-dashes>.sslip.io, BETTER_AUTH_URL=https://<same>, secrets, keys
   ```
3. **Google OAuth**: in Google Cloud Console create an OAuth client (Web) with redirect URI `https://<APP_HOST>/api/auth/callback/google`; publish the consent screen (scopes: openid, email, profile).
4. **Start**
   ```bash
   docker compose up -d --build
   curl -I https://<APP_HOST>          # Caddy fetches a Let's Encrypt certificate automatically
   ```
5. **Backups** (nightly, 14-day retention):
   ```bash
   (crontab -l; echo "15 3 * * * cd /opt/cashflow && docker compose exec -T app node scripts/backup.mjs") | crontab -
   ```
6. **Update**: `git pull && docker compose up -d --build` (migrations run on start).

Moving to a real domain later: point an A record at the server, change `APP_HOST` + `BETTER_AUTH_URL`, add the new redirect URI in Google, `docker compose up -d`.

## Architecture

| Folder | Responsibility |
|---|---|
| `jurisdictions/` | Per-country packs: currency, tax rates, invoice rules, deadline generators, CSV synonyms, chart of accounts |
| `invoicing/`, `pdf/` | Document lifecycle (invoices, quotes, credit notes), payment matching, recurring billing, emails, react-pdf documents |
| `einvoice/` | EN 16931 CII builder (ZUGFeRD/XRechnung) |
| `tax/` | VAT/GST/sales-tax return periods and form layouts |
| `ingest/` | CSV detection/normalization, CAMT/OFX parsing, PDF extraction (poppler + LLM), verification, jobs |
| `bookkeeping/` | Categorization (rules + AI), receipts, P&L, monthly close |
| `advisory/` | Metrics, cash outlook, trigger evaluation |
| `server/` | `requireOrg()` tenancy choke point, repositories, server actions |
| `demo/` | Seeded sandbox workspaces |

All tenant data goes through `server/repos/*` with an explicit `orgId`. Money is integer minor units; dates are ISO strings.
