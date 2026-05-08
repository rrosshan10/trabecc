# Checklist

The single ordered to-do list to take Trabecc from code-on-disk to first
paying customers. Check items off in order. Don't skip ahead.

> Pair this with `BUSINESS.md` (rationale and copy) and `launch/` (what to
> say where). This file is just the actions.

---

## Phase 0 — Status (snapshot)

- ✅ Name: **Trabecc**
- ✅ Domain bought: `trabecc.com` (via IONOS)
- ✅ Repo renamed end-to-end; 30/30 tests green; e2e smoke green
- ✅ CI green on `main` (smoke test self-sufficient; doctor timeout fixed)
- ✅ Production landing page **LIVE** at `https://trabecc.com` (Vercel)
- ✅ Vercel root `vercel.json` in place to prevent git-deploy from
      compiling the gateway as if it were the website
- ✅ npm package published *(when 2FA OTP completes)*
- 🚧 npm CI publishing path (NPM_TOKEN secret) — not set up yet, can wait
      until v0.1.1
- 🚧 Email forwarding at IONOS — `support.team@`, `security@`, `conduct@`
- 🚧 Dogfood, cold-email list, polish, launch — phases 3-8 below

---

## Phase 1 — GitHub + DNS + email (~30 min remaining)

- [x] `git init && git add -A && git commit && git push` on
      `github.com/rrosshan10/trabecc` (renamed from `Agent-Gate`).
- [x] CI is green on `main`.
- [x] DNS for `trabecc.com` lives at IONOS, A record points at Vercel
      (`216.198.79.1` resolves nationally).
- [x] Set up **IONOS Email Forwarding** for these aliases →
      your personal inbox:
      `support.team@trabecc.com`, `security@trabecc.com`,
      `conduct@trabecc.com`.
- [x] Verified forwarding works (test email landed in inbox).

**End-of-phase check:** ✅ Email infrastructure live. All four landing-page
CTAs route to a real inbox you read.

---

## Phase 2 — Ship the npm package

- [x] npm account created with 2FA enabled.
- [x] `npm view trabecc` returns 404 (name available).
- [x] `npm pack --dry-run` audit: 21 files, 23.5 KB, no leaks.
- [x] Hit the `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` blocker;
      fixed by adding `tsconfig.build.json` + `npm prepack` build pipeline
      that emits `dist/`.
- [x] Verified install end-to-end from a clean tmp dir
      (`--help` / `init` / `policy check` / `doctor` all work).
- [x] `npm publish --no-provenance --otp=…` succeeded.
- [x] `npx trabecc@latest --help` works on a fresh machine.
      Package URL: https://www.npmjs.com/package/trabecc
- [ ] Add `NPM_TOKEN` secret to GitHub repo for v0.1.1+ via CI
      (Granular Access Token, scope: `trabecc` package, "Bypass 2FA for
      publishing": yes). Then future releases trigger via
      `git tag v0.1.x && git push --tags`. Not urgent — manual
      `npm publish` still works whenever you want to ship a patch.

**End-of-phase check:** ✅ Anyone in the world can `npx trabecc@latest`.

---

## Phase 3 — Run Trabecc on yourself (Day 3, ~1 hour to set up,
permanent payoff)

- [ ] Wire your own Claude Desktop / Claude Code / Cursor through Trabecc
      (`trabecc run` as the MCP command).
- [ ] Add 3-4 upstream servers you use daily (filesystem, github, etc).
- [ ] Live in this setup all weekend. You will hit one bug. Fix it. Cut
      `v0.1.1`.
- [ ] Take 4 screenshots: dashboard, policy YAML, CLI doctor output, audit
      JSON. Save to `launch/screenshots/`. Embed in README and tweets.

**End-of-day check:** Your dashboard shows real audit records from your
own work, not test data.

---

## Phase 4 — Build the cold-email list (Day 4, ~3 hours)

- [ ] Open a Google Sheet with columns: `email | name | company | role |
      signal | sent | replied | demo | paid`.
- [ ] Find 50 ICP-fit prospects via the playbook in `launch/COLD_EMAIL.md`.
      Search GitHub for repos importing `@modelcontextprotocol/sdk`.
- [ ] Every row must have a *specific signal* (the recent talk, the open
      issue, the blog post) — no generic outreach.
- [ ] For 30 of the 50, find the real email address (use `Hunter.io` or
      LinkedIn pattern-match: `first.last@company.com`).

**End-of-day check:** 50 named prospects, 30 with confirmed email.

---

## Phase 5 — Final polish (Day 5, ~2 hours)

- [ ] Read the README aloud. Edit anywhere you stumble. Specifically check:
      install command, Claude Desktop config block, default-deny rationale.
- [ ] Schedule the launch tweet thread (`launch/TWITTER_THREAD.md`) for
      Tuesday 8:30am PT.
- [ ] Re-read `launch/CHECKLIST.md` for the launch-day timing.
- [ ] Pre-write the day-of routine on an index card; tape to monitor.

**End-of-day check:** You can describe Trabecc in 12 words.

---

## Phase 6 — Production landing page (DONE)

Production live on **Vercel** (not Cloudflare Pages — switched because
DNS stayed at IONOS). State of play:

- [x] Vercel project `trabecc` exists under `rrosshan10s-projects`.
- [x] Production deployment URL aliased to `trabecc.com` and
      `www.trabecc.com`.
- [x] Let's Encrypt cert issued for both.
- [x] `https://www.trabecc.com` returns 200 with the landing page.
- [x] `https://trabecc.com` 307-redirects to www.
- [x] Root `vercel.json` prevents the git-deploy auto-detection from
      compiling the gateway TypeScript as a website.
- [ ] Real-phone test (open `https://trabecc.com` on your iPhone/Android,
      scroll the page, tap each CTA — verify the `mailto:` opens your
      mail client and the GitHub buttons work).
- [ ] Confirm email forwarding (test from your phone after Phase 1
      is complete).

---

## Phase 6.5 — Set up the money rails (~30 min, do this NOW)

The OSS is public; anyone can `npm install -g trabecc`. The cloud product
is what you sell. You don't need to *build* the cloud product yet — you
need to be able to *take payment* the moment someone says yes.

**Cost reality:** Stripe basic = **$0 setup, $0 monthly, 2.9% + 30¢ per
successful charge only.** On a $29 Pro subscription that's $1.14 to
Stripe. With zero customers your Stripe cost is zero. There is no other
mainstream processor with lower per-transaction fees at this volume.

- [ ] **Create a Stripe account** at [stripe.com](https://stripe.com).
      Use `support.team@trabecc.com`. Personal account is fine — payouts
      go to your bank. **Skip Stripe Atlas** ($500 incorporation product)
      until you have $2k+ MRR or a customer demands a US entity. **Skip
      Stripe Tax** until international customers force the issue.
- [ ] **Create three Products in Stripe**, matching the landing-page
      tiers:
      - `Trabecc Pro` — $29 / user / month, recurring
      - `Trabecc Team` — $99 / user / month, recurring
      - `Trabecc Enterprise` — custom (use a one-off Invoice each time)
- [ ] **Generate a Stripe Payment Link** for Pro. Single shareable URL.
      No code. Customer clicks → enters card → you get an email and the
      money lands in your Stripe balance.
- [ ] (Optional, ship later) Replace the `mailto:` CTAs on the landing
      page with the Stripe Payment Link. For Team/Enterprise, keep
      `mailto:` so they reach a human first.
- [ ] **Set up a Stripe webhook** to email you on every successful
      payment. Until you have 5+ paying customers, you respond
      personally to each one.

**End-of-phase check:** You can send anyone a single URL. They click it,
enter a card, and you have $29 in your Stripe balance. No SaaS code yet,
just billing infrastructure.

### When (not) to switch payment processors later

| Trigger | Switch to |
| --- | --- |
| < 50 customers | Stay on Stripe |
| 50+ customers across many countries; tax compliance > 2 hr/mo | **Lemon Squeezy** or **Polar.sh** as Merchant of Record (~5% per-tx but they handle VAT) |
| Enterprise customers paying > $5k/yr | Stripe Invoice (still Stripe; just send a one-off invoice instead of a subscription) |
| Customer hands you a wire transfer | Take the money, send a paper invoice. Don't optimize for these — celebrate them. |

---

## Phase 7 — Pre-launch ping (Day 6, ~1 hour)

- [ ] Email the 10 most-promising prospects with: *"Launching this on HN
      tomorrow. If you'd rather get it directly with 50% off Pro, reply
      and I'll set you up tonight."*
- [ ] Aim for 1-2 yeses. Even 1 paid pilot makes "I have customers" true
      on launch morning.
- [ ] Clear your calendar for Tuesday 8am-2pm PT.
- [ ] Tell three friends launch is tomorrow. Public commitment.

---

## Phase 8 — Launch day (Tuesday)

Run the timing in [launch/CHECKLIST.md](launch/CHECKLIST.md). Summary:

- [ ] **8:30am PT** — submit Show HN (`launch/SHOW_HN.md`), post Tweet 1,
      post r/LocalLLaMA (`launch/REDDIT_LOCALLLAMA.md`).
- [ ] **8:32am PT** — post your first comment on the HN submission.
- [ ] **First 4 hours** — reply to every HN/Twitter comment within
      30 minutes.
- [ ] **Afternoon** — send the first 10 cold emails. One at a time, each
      personalized.
- [ ] **Evening** — write the day's results in a private journal.
      Screenshot stars at 100/500/1000 milestones.

---

## Phase 9 — Week 2 (after launch)

- [ ] Send 10 cold emails per day, every weekday.
- [ ] Ship one bug-fix release within the first week. It signals "alive."
- [ ] Open the second-most-asked-for feature as a tracked GitHub issue
      with a concrete spec, even if you won't ship it for a month.
- [ ] If a stranger files a real bug report → drop everything, ship a fix
      the same day. Single highest-leverage trust-builder.
- [ ] Reach out to maintainers of 3 related projects. Offer free cloud
      access in exchange for honest feedback.

---

## Phase 10 — First revenue (Week 2-3)

Stripe is already wired up from Phase 6.5. This phase is about *converting
intent to dollars*.

- [ ] Convert your 1-2 verbal pre-launch yeses into Stripe Payment Link
      checkouts.
- [ ] On the first paid invoice: post a screenshot (numbers blurred) on
      X. "First $X. Onward." This is content for future investors.
- [ ] On every paid customer (#1 through #5): schedule a 30-min call
      *the week they sign up*. They will tell you what to build next —
      and "what they'd pay another $50/mo for" sets your roadmap.
- [ ] When customer #5 signs up, **start building the cloud control
      plane** (Phase 11). Before that, you don't have signal — after
      that, you do.

---

## Phase 11 — Cloud control plane (Week 3-4)

Only after you have ≥5 cloud-tier signups:

- [ ] Spin up a Hono service receiving the `/v1/ingest` POSTs the OSS
      already sends. Postgres for storage. Cloudflare Workers or Fly.io
      for hosting (~$5/mo at this scale).
- [ ] Build the per-tenant dashboard. The data model is identical to
      `src/audit/store.ts`; reuse the schema.
- [ ] Wire Stripe Billing for proper subscriptions. Now you have a real
      ARR meter.

---

## Quarterly checkpoints

### 30 days after launch — pulse check

- [ ] **GitHub stars > 1000** → distribution working. Continue.
- [ ] **Stars > 1000, paid customers = 0** → re-read `launch/COLD_EMAIL.md`.
      Convert attention to revenue.
- [ ] **Stars < 200, paid = 0** → message isn't landing. Talk to 5 humans
      on the phone. Iterate the README.

### 90 days — decide

- [ ] **MRR > $5k** → consider raising a $1.5M pre-seed at $8M cap. One
      single-fund check, no syndicate.
- [ ] **MRR $1-5k** → keep building. Don't raise yet.
- [ ] **MRR < $1k, distribution stalled** → pivot the wrapper, keep the
      engine. The audit-log + policy primitive is reusable for adjacent
      categories (model-call governance, agent telemetry).

---

## Things to never do

- ❌ Email-spray a generic message to 1000 people. Volume without
      personalization is noise.
- ❌ Buy ads before $10k MRR. CAC is unlearnable until you have organic
      conversions to compare against.
- ❌ Hire before $30k MRR. Every dollar of pre-PMF burn is a dollar
      shorter your runway is.
- ❌ Build features users haven't paid for. Your roadmap is a function of
      who's writing checks, not who's loudest on Twitter.
- ❌ Ignore the boring infrastructure work (CI green, npm install works
      on Windows, docs render). It's what separates real projects from
      hobby projects.
- ❌ Delete the audit log of yourself. Screenshot every milestone — first
      issue from a stranger, first paid invoice, first 1000 stars. These
      are Series A pitch material.
