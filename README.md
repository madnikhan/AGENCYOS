# Agency OS — AI Digital Marketing Automation

Claude-powered agency tool for **any local business** (taxi, restaurant, mechanics, security, salon, and more). Draft multi-platform content, then **auto-publish when hybrid rules pass**.

Light, **responsive** dashboard · login auth · Settings for API keys · Analytics · per-client social Connect · website blog embed.

## How it works

1. **Sign in** — agency email/password (seeded demo user below).
2. **Settings** — paste agency API keys once (Meta, Claude, TikTok, YouTube, fal…).
3. **Clients** — add a business with an **industry**, then Connect Facebook / Instagram / TikTok / YouTube (or paste a Page token).
4. **Website blog** — copy the Agency OS embed script onto any site.
5. **Create content** → optionally attach logos / brand boards / PDFs for Claude → drafts appear under **Posts** → **Review posts** when rules require approval → publish.
6. **SEO** — research domains/keywords (DataForSEO), track ranks (Search Console), backlinks, site checks, then **Add to brief**.
7. **Analytics** — DB funnel, engagement, plus SEO tracked/selected keyword counts.
8. **Client report** — print-friendly monthly HTML from `/clients/[id]/report`.

On Create content you can attach up to 5 images or PDFs (10MB each). Claude uses them (plus brand kit colors) so drafts match the client’s look.

```
Login → Settings (API keys + DataForSEO)
        ↓
Client Connect (social + optional Search Console)
        ↓
SEO research → Create content → Worker → Approve/Publish
        ↓
Analytics + client report
```

## Minimal `.env` (infrastructure)

```bash
DATABASE_URL=postgresql://seo:seo@localhost:5432/seo_agency
REDIS_URL=redis://localhost:6379
TOKEN_ENCRYPTION_KEY=change-me-to-a-32-byte-secret-key!!
API_PORT=4000
API_URL=http://localhost:4000
WEB_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:4000
# optional override for seed password:
# SEED_PASSWORD=reachline-demo
```

Platform keys go in the **dashboard Settings** page (env still works as fallback).

## Quick start

```bash
cp .env.example .env
pnpm install
pnpm db:generate
pnpm db:push
pnpm --filter @seo/shared build
pnpm --filter @seo/db build
pnpm --filter @seo/api seed

pnpm --filter @seo/api dev
pnpm --filter @seo/worker dev
pnpm --filter @seo/web dev
```

- Login: http://localhost:3000/login  
  **Demo:** `editor@agency.local` / `reachline-demo` (change after first login)
- Dashboard: http://localhost:3000
- Settings: http://localhost:3000/settings
- SEO: http://localhost:3000/seo
- Analytics: http://localhost:3000/analytics

## SEO setup (DataForSEO + Search Console)

1. **DataForSEO** — create an account at [dataforseo.com](https://dataforseo.com/), then in **Settings** paste login (email) + API password. Without credentials, SEO pages return **demo** keyword/domain/backlink data so you can still walk the flow.
2. **Google Search Console** — reuse the same Google OAuth client as YouTube. In Google Cloud Console, add authorized redirect URI:
   `http://localhost:4000/oauth/gsc/callback` (or your API host + `/oauth/gsc/callback`).
3. Open a client → **SEO** → set the GSC property URL (e.g. `https://example.com/` or `sc-domain:example.com`) → **Connect Search Console**.
4. Research keywords → select for brief → **Create content** (prefills locality keywords). Rank sync runs on demand and daily via the worker queue.

## Smoke test

With API running (and seed applied):

```bash
node scripts/smoke-api.mjs
```

Validates login, session cookie, stats, clients, brief create, posts, analytics, logout. Live OAuth/publish is **skipped** until keys are configured — use the checklist below.

## Manual Connect / publish checklist

1. Sign in → **Settings** → paste Claude + Meta (+ TikTok / YouTube as needed) → Save.
2. Open a **Client** → Connect Facebook / Instagram (and others). Confirm Connected badges.
3. **Create content** (optional brand attachments) → land on **Posts** while drafts generate.
4. When status is Pending → **Review posts** → Approve. Or open post detail → Approve / Retry if Failed.
5. Confirm **PUBLISHED** (or read `errorMessage` on Failed).
6. **Analytics** → Refresh insights for live Meta/YouTube engagement on published posts.

## Stack

| Layer | Tech |
|-------|------|
| Dashboard | Next.js 15 (auth shell, responsive) |
| API | Express + session cookies + TypeScript |
| Workers | BullMQ |
| DB | PostgreSQL + Prisma |
| AI | Anthropic Claude (industry-aware + attachments) |

## Monorepo

```
apps/web          # Agency OS UI (incl. SEO + client reports)
apps/api          # REST + auth + OAuth + Settings + SEO + analytics + embed
apps/worker       # generate / media / publish / daily GSC SEO sync
packages/db       # Prisma + credentials resolver
packages/shared   # Zod, crypto, rules, queue names
scripts/          # smoke-api.mjs
```
