# Checklist

The single ordered to-do list to take Trabecc from code-on-disk to first
paying customers. Check items off in order. Don't skip ahead.

> Pair this with `BUSINESS.md` (rationale and copy) and `launch/` (what to
> say where). This file is just the actions.

---

## Phase 0 — Status (today)

- ✅ Name: **Trabecc**
- ✅ Domain bought: `trabecc.com`
- ✅ Repo renamed end-to-end (30/30 tests green, e2e smoke green)
- ⏳ DNS propagation in flight — typically full within 1-24h
- ⏳ Production deploy: **wait until all phases below are complete**, then
      deploy as a single act. Target: tomorrow or the day after.

The plan is to finish every phase locally first, queue everything up, and
push to production in one coordinated push when DNS is settled.

---

## Phase 1 — GitHub + Cloudflare prep (~1 hour, can do now)

- [ ] In `/Users/roshan/Documents/Agent Gate`: `git init && git add -A &&
      git commit -m "initial commit"`.
- [ ] Create the public repo at `github.com/rrosshan10/trabecc`, MIT
      license. Push.
- [ ] Confirm CI is green on `main` (the `.github/workflows/ci.yml` runs
      on every push). If it isn't, fix before moving on.
- [ ] In Cloudflare dashboard: add `trabecc.com` as a site (skip if
      already imported). Confirm nameservers are pointing at Cloudflare
      (the registrar bundle handles this automatically if you bought via
      Cloudflare Registrar — otherwise update at the registrar).
- [ ] Set up Cloudflare Email Routing on `trabecc.com`:
      `support.team@trabecc.com`, `security@trabecc.com`, `conduct@trabecc.com`
      → all forward to your personal inbox.

**End-of-phase check:** GitHub repo public + CI green, DNS at Cloudflare,
email forwarding configured but not yet tested (the MX records take
~30 min to propagate).

---

## Phase 2 — Ship the npm package (Day 2, ~2 hours)

- [ ] Create npm account if needed. Enable 2FA (required for `provenance`).
- [ ] Run `npm view trabecc` → confirm 404. If taken, rename the package
      in `package.json` (`trabecc-cli` is a fine fallback).
- [ ] In a fresh clone: `npm install && npm publish --dry-run`. Verify the
      file list contains no `.env`, `audit.db`, or `trabecc.yaml`.
- [ ] Add `NPM_TOKEN` secret to GitHub repo settings.
- [ ] Tag the release: `git tag v0.1.0 && git push --tags`. The
      `release.yml` workflow auto-publishes.
- [ ] On a clean machine (Codespaces, friend's laptop, fresh shell):
      `npx trabecc@latest doctor` should work. If it doesn't, fix
      *before* the launch.
- [ ] Confirm the install snippet on the README and landing page still
      runs verbatim.

**End-of-day check:** Anyone in the world can `npx trabecc@latest run` and
get a working gateway.

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

## Phase 6 — Deploy production landing page (when DNS is settled, ~30 min)

This is the "go live" moment. Confirm DNS propagation first
(`dig +short A trabecc.com` returns a Cloudflare IP), then deploy.

- [ ] In the Cloudflare dashboard → **Pages** → **Create project** →
      **Connect to Git** → select the `rrosshan10/trabecc` repo.
- [ ] Build settings:
      - Framework preset: **None**
      - Build command: *(leave blank)*
      - Build output directory: `landing`
- [ ] Deploy. First deploy takes ~30s.
- [ ] Custom domains → add `trabecc.com` and `www.trabecc.com`. Cloudflare
      auto-issues the cert.
- [ ] Visit `https://trabecc.com` — confirm landing page loads, all four
      `mailto:` links open mail clients with prefilled subjects, GitHub
      buttons go to your repo.
- [ ] Test the page on a real phone (mobile Safari + Chrome).
- [ ] Send yourself an email to `support.team@trabecc.com` from your phone —
      confirm it lands in your inbox.
- [ ] In Cloudflare DNS: verify the SPF / DKIM records that Email Routing
      added are present.

**End-of-phase check:** `trabecc.com` is live, mobile-clean, all CTAs work,
email forwarding tested end-to-end.

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

- [ ] Set up a **Stripe** account. Skip the subscription product for now —
      use Stripe Invoices instead. Free, no UI to build, just generate a
      payment link per customer.
- [ ] Convert your 1-2 verbal pre-launch yeses into invoices.
- [ ] On the first paid invoice: post a screenshot (numbers blurred) on
      X. "First $X. Onward." This is content for future investors.
- [ ] On every paid customer (#1 through #5): schedule a 30-min call
      *the week they sign up*. They will tell you what to build next.

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
