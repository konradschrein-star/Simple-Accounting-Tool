# Cashflow Compass

Self-hosted, multi-tenant invoicing, bank-statement ingestion, AI bookkeeping and cash-flow advisory for small businesses in **Germany, the UK, the US and Jersey** — a free product that qualifies leads for a strategic planning offer and a done-for-you bookkeeping service.

- **Invoicing**: compliant PDFs (§14 UStG, UK VAT, Jersey GST, US), gap-free numbering, live preview, paid/overdue tracking, Stripe payment links.
- **Bank imports without Plaid**: CSV with automatic column detection (Sparkasse, DKB, N26, Monzo, Barclays, Chase…) and PDF statements read by open-weight models (DeepSeek / Qwen via OpenRouter, zero-data-retention only), verified against the statement's own balances with automatic escalation.
- **AI bookkeeping**: heuristics → rules → AI categorization into country-specific charts of accounts mapped to tax-return lines, review queue with confidence, rule learning, monthly close with written summary, P&L + CSV export, audit log.
- **Advisory triggers**: €/£/$10k milestones, margin below 25 %, upcoming tax deadlines → “Request a Strategic Cash-Flow & Growth Plan”.
- **Team**: admin lead list (opt-in only), bookkeeper console with consent-gated client access.
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
| `invoicing/`, `pdf/` | Invoice rules, snapshot, react-pdf documents |
| `ingest/` | CSV detection/normalization, PDF extraction (poppler + LLM), verification, jobs |
| `bookkeeping/` | Categorization (rules + AI), P&L, monthly close |
| `advisory/` | Metrics, trigger evaluation |
| `server/` | `requireOrg()` tenancy choke point, repositories, server actions |
| `demo/` | Seeded sandbox workspaces |

All tenant data goes through `server/repos/*` with an explicit `orgId`. Money is integer minor units; dates are ISO strings.
