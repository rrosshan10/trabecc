# DEPLOY.md

> Trabecc landing-page production deploy. Five minutes end-to-end.

You're at: domain bought (`trabecc.com`, IONOS DNS), code green (30/30 tests), landing page staged at `landing/`. This file is the literal runbook to flip it live.

---

## Step 1 — Rename the GitHub repo (1 minute)

Your local remote currently points at `rrosshan10/Agent-Gate.git`. Before publishing to npm, the GitHub repo name should match the package name.

In github.com → your repo → **Settings → General → Repository name** → change `Agent-Gate` to `trabecc` → **Rename**. GitHub auto-301-redirects old URLs.

Then update your local remote:

```sh
cd "/Users/roshan/Documents/Agent Gate"
git remote set-url origin https://github.com/rrosshan10/trabecc.git
git fetch origin
```

---

## Step 2 — Deploy the landing page to Vercel (2 minutes)

Vercel CLI is already installed locally; your auth token expired so we re-login first.

```sh
cd "/Users/roshan/Documents/Agent Gate/landing"
npx vercel login
# (browser opens; sign in. Use the same Vercel account as devcloudacademy.)

npx vercel deploy --prod --yes
# When prompted:
#   "Set up and deploy …/landing?"  → y
#   "Which scope?"                    → your personal account
#   "Link to existing project?"       → n
#   "Project's name?"                 → trabecc       (or accept default)
#   "Directory with code?"            → ./            (current dir)
```

Vercel returns a production URL like `https://trabecc-xxxx.vercel.app`. Visit it; the landing page should render exactly as you see it locally.

---

## Step 3 — Add `trabecc.com` as a Vercel domain (1 minute)

In **Vercel dashboard → trabecc project → Settings → Domains**:

1. Add `trabecc.com`. Vercel will tell you it's not yet pointing at Vercel — that's fine.
2. Add `www.trabecc.com` and set "Redirect to: trabecc.com (308)".

Vercel will show you DNS records you need to add. They look like:

```
Type   Name   Value
A      @      76.76.21.21
CNAME  www    cname.vercel-dns.com
```

---

## Step 4 — Point IONOS DNS at Vercel (1 minute)

Log into your IONOS account → **Domains & SSL** → click `trabecc.com` → **DNS**.

Edit the records:

| Type | Host | Points to | TTL |
| --- | --- | --- | --- |
| **A** | `@` (or blank) | `76.76.21.21` | 1 hour |
| **CNAME** | `www` | `cname.vercel-dns.com` | 1 hour |

Delete any existing A records pointing at `217.160.0.204` (IONOS default parking IP) to avoid conflicts.

Save. DNS propagation typically completes in 5-30 minutes; sometimes faster since this is a fresh-ish domain.

---

## Step 5 — Wait, then verify

```sh
# Check propagation:
dig +short A trabecc.com @8.8.8.8
# Should return: 76.76.21.21

# Wait until Vercel marks the domain as "Valid Configuration" (auto-refresh).
# Vercel auto-issues the TLS cert via Let's Encrypt within ~60 seconds.

# Then:
curl -sSI https://trabecc.com
# Expect: HTTP/2 200, server: Vercel
```

Visit `https://trabecc.com` in a browser — the landing page should load over HTTPS. Test on mobile too.

---

## Step 6 — Test email forwarding

Email is *not* automatic on Vercel. Set up forwarding via your registrar or a forwarding service:

**Option A: IONOS Email Forwarding** — log into IONOS, create forwarding for `hello@trabecc.com`, `security@trabecc.com`, `conduct@trabecc.com` → your personal address. IONOS includes this with most domain plans.

**Option B: Cloudflare Email Routing (free)** — requires moving DNS to Cloudflare. Skip for now; IONOS Option A is faster.

Send yourself an email to `hello@trabecc.com` from your phone to verify.

---

## Done. What's now live

- `https://trabecc.com` serves the landing page over HTTPS
- `https://www.trabecc.com` redirects to root
- `mailto:hello@trabecc.com` works on every CTA
- `dig trabecc.com` returns Vercel's IP
- Landing page is fully responsive, no JS dependencies, ~16KB gzipped

When you've completed all 6 steps, head to **CHECKLIST.md** Phase 2 (npm publish).

---

## Troubleshooting

**Vercel says "Invalid Configuration" for trabecc.com after 30 min.** → DNS hasn't propagated. Re-check IONOS records, then wait. Use `dig` to confirm.

**TLS error / cert mismatch.** → Vercel hasn't issued the cert yet. It happens automatically once DNS resolves. Refresh the Domains panel; click "Refresh" or "Verify" if Vercel offers it.

**`npm publish` fails because GitHub URL 404s.** → You skipped Step 1. Rename the repo first.
