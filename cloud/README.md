# Trabecc Cloud

> The hosted half of Trabecc. Receives audit events from OSS gateways via
> `https://api.trabecc.com/v1/ingest`, stores them in Postgres with tenant
> isolation, and serves a multi-host dashboard.
>
> v0.2.0 — MVP. Ingest, dashboard, API key auth. No signup UI yet (manual
> via CLI). No Stripe webhook integration yet (manual provisioning after
> a customer pays). No anomaly alerts yet (Phase 12).

## Architecture

```
┌──────────────┐     POST /v1/ingest      ┌──────────────────┐
│ OSS gateway  │ ────────────────────────▶│ Trabecc Cloud    │
│ (every host) │  Bearer tk_live_…        │ (Vercel Function)│
└──────────────┘                           └────────┬─────────┘
                                                    │
                                                    ▼
                                           ┌──────────────────┐
                                           │ Neon Postgres    │
                                           │  organizations   │
                                           │  api_keys        │
                                           │  audit_events    │
                                           └──────────────────┘
```

Stack: **Hono** (HTTP framework, runs on Vercel Edge / Node / Bun / Cloudflare)
+ **postgres.js** (raw SQL client) + **Neon Postgres** (serverless free tier)
+ **Vercel Functions** (deploy target).

The OSS gateway's `src/audit/sync.ts` already POSTs to this endpoint when
`cloud.apiKey` is set in `trabecc.yaml`. The wire format is documented in
the OSS code; this server's `cloud/src/ingest.ts` is the matching reader.

## Local development

### 1. Get a Postgres database (Neon, free)

1. [neon.tech](https://neon.tech) → create project `trabecc-cloud`.
2. Copy the connection string (it looks like `postgres://USER:PWD@HOST/DB?sslmode=require`).

### 2. Configure

```sh
cd cloud
cp .env.example .env
# Edit .env, paste the Neon connection string into DATABASE_URL.
npm install
```

### 3. Apply schema

```sh
npm run admin -- migrate
```

### 4. Provision an org + key for testing

```sh
npm run admin -- create-org "Localhost Dev" pro
# → prints org_xxxxx

npm run admin -- create-key org_xxxxx "local test"
# → prints tk_live_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
# Save this; it's shown only once.
```

### 5. Run

```sh
npm run dev
# → http://localhost:8787
```

### 6. Verify

```sh
# Health (unauthenticated):
curl -sS http://localhost:8787/v1/health
# → {"ok":true,"version":"0.2.0","service":"trabecc-cloud"}

# Ingest (authenticated):
curl -sS -X POST http://localhost:8787/v1/ingest \
  -H "Authorization: Bearer tk_live_…" \
  -H "Content-Type: application/json" \
  -d '{"installId":"test-host","hostId":"test","droppedSinceLastFlush":0,"events":[]}'
# → {"ok":true,"accepted":0}

# Dashboard (in browser):
open "http://localhost:8787/?key=tk_live_…"
```

### 7. Wire the OSS to push to it

In your local `~/.trabecc/config.yaml`:

```yaml
cloud:
  enabled: true
  endpoint: http://localhost:8787/v1/ingest
  apiKey: tk_live_…
```

Restart Claude Desktop. Real audit events flow into the cloud DB.

## Deploy to Vercel

### One-time setup

```sh
cd cloud
npx vercel link
# Choose: new project, name "trabecc-cloud", framework "Other"
```

Then in the Vercel dashboard for the new project:

1. **Settings → Environment Variables**: add `DATABASE_URL` (your Neon
   production connection string — different from local; create a new Neon
   project for prod).
2. **Settings → Domains**: add `api.trabecc.com`. In your DNS provider
   (IONOS), add a CNAME record:
   ```
   api  →  cname.vercel-dns.com
   ```
3. Wait ~1 minute for the cert.

### Deploy

```sh
npx vercel deploy --prod
```

The OSS gateway's default `cloud.endpoint` is already
`https://api.trabecc.com/v1/ingest`, so users with `cloud.apiKey` set in
their `trabecc.yaml` will start hitting your production cloud immediately.

### Schema migration in production

```sh
DATABASE_URL=postgres://…prod… npm run admin -- migrate
```

Run this **once** before flipping any customer's `cloud.apiKey` flag in
production. The schema is idempotent (`CREATE TABLE IF NOT EXISTS`) so
re-running is safe.

## Provisioning a paying customer

For each new Pro/Team customer (until automated billing in v0.3):

```sh
# 1. Create their org
DATABASE_URL=postgres://…prod… npm run admin -- create-org "Acme Corp" pro

# 2. Create one API key per host they'll deploy on (or one shared key)
DATABASE_URL=postgres://…prod… npm run admin -- create-key org_abc "production"

# 3. Email them the key + a link to docs:
#    "Set this as cloud.apiKey in your trabecc.yaml. Dashboard:
#     https://api.trabecc.com/?key=tk_live_..."
```

## What's NOT in v0.2.0

- **Signup UI** — first 10 customers are manually provisioned via CLI.
- **Stripe webhook → automatic API key** — wire this up in v0.3 when
  there are >5 paying customers and CLI provisioning becomes a chore.
- **Anomaly alerts** — Phase 12.
- **Multi-host views with charts** — current dashboard is a single
  table; the OSS-side dashboard has the SVG charts. Cloud will get them
  next iteration.
- **Retention enforcement** — `retention_days` is on the org table but
  no nightly job purges old events yet. Manual via SQL until you have a
  customer who actually has 90 days of data.
- **Auth via session cookie** — current is `?key=` in URL, which is
  fine for personal-use dashboards but not for shared org accounts.
  v0.3 swaps for a magic-link login.

## Surface

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `GET /v1/health` | none | liveness probe |
| `POST /v1/ingest` | Bearer | OSS gateways push event batches here |
| `GET /v1/audit?limit=` | Bearer | recent events for the authenticated org |
| `GET /v1/stats?windowMinutes=` | Bearer | aggregated counts |
| `GET /?key=tk_live_…` | query param | browser dashboard |
