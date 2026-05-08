# BUSINESS.md

> What I built for you stops here. What only you can do starts here.

This is the 8-day plan to take Trabecc from "code on disk" to "live business
with first paying customers." It's deliberately short. Reading it should take
5 minutes. Executing it will take 8 days, with the deploy happening on Day 2
once DNS settles.

Every action below is something only the human founder can do. Where I
*could* have done it for you (write the code, design the dashboard, draft
the launch copy), I already did. The repo is launch-ready.

---

## Day 1 — Prep everything; do not deploy yet

**Estimated time: ~1.5 hours. Domain is bought; DNS is propagating. We
finish all the prep work locally and at GitHub today, and only push to
production tomorrow when DNS has fully settled and the CDN is ready.**

1. **Push the OSS code to GitHub.** Create
   [github.com/rrosshan10/trabecc](https://github.com/rrosshan10/trabecc),
   public, MIT. `git init && git remote add … && git push`. Verify CI is
   green within 10 minutes. (20 min)
2. **In Cloudflare, add `trabecc.com` as a site.** If you bought via
   Cloudflare Registrar, this is automatic. Otherwise update nameservers
   at the registrar. (10 min)
3. **Set up Cloudflare Email Routing.** Forward `support.team@trabecc.com`,
   `security@trabecc.com`, and `conduct@trabecc.com` to your personal
   inbox. Don't test yet — MX records take a while to propagate. (10 min)
4. **Configure Cloudflare Pages but don't deploy yet.** Create the
   project, connect the `rrosshan10/trabecc` repo, set build output
   directory to `landing`, but **don't add the custom domain** until DNS
   has fully propagated. The preview URL (something like
   `trabecc.pages.dev`) is fine to validate from. (15 min)
5. **Visit the preview URL** on desktop and mobile. Confirm landing
   renders, all `mailto:` links open, GitHub buttons resolve. (10 min)
6. **Post a "soft launch" tweet** from your existing handle: *"Been
   building this for a few weeks — `trabecc.com` going live in a couple
   of days. The gateway for every AI tool call."* This anchors a public
   date and primes a warm audience. (5 min)

**End-of-day check:** GitHub repo is public with green CI, Cloudflare
Pages preview shows the landing page, email forwarding is configured but
not yet tested, custom domain *not yet* attached.

---

## Day 2 — Deploy production (~30 min, the moment DNS is ready)

The single thing this day exists for: get `trabecc.com` live.

1. **Verify DNS propagation.** Run `dig +short A trabecc.com` from a few
   shells (your laptop, a phone hotspot, dnschecker.org). All should
   return Cloudflare IPs (typically `104.x.x.x` or `172.67.x.x`). If
   results differ across resolvers, wait another hour. (5 min)
2. **In Cloudflare Pages → custom domain**, attach `trabecc.com` and
   `www.trabecc.com`. Cloudflare auto-issues the cert. Wait for the
   green checkmark. (10 min)
3. **Visit `https://trabecc.com`.** Verify all four `mailto:` CTAs open,
   GitHub buttons resolve, page renders correctly on desktop *and* a
   real phone (not just chrome devtools). (10 min)
4. **Send `support.team@trabecc.com` from your phone.** Confirm it lands in
   your inbox. Repeat for `security@`. (5 min)

**End-of-day check:** Type `trabecc.com` into a browser. The site loads
over HTTPS, looks polished, and every link works.

---

## Day 3 — Ship the npm package

**Estimated time: 2 hours.**

1. **Create an npm account** if you don't have one. Enable 2FA (required
   for `provenance` publishing). (10 min)
2. **Reserve the name.** `npm view trabecc` should 404. If it doesn't,
   it's parked — file a name dispute or rename to `trabecc-cli`. (5 min)
3. **Test publish from a clean checkout.** Clone your fresh GitHub repo
   into `/tmp/trabecc-clean`, run `npm install`, then `npm publish
   --dry-run`. Confirm the file list has no `.env`, no `trabecc.yaml`,
   no `audit.db*`. The `files` array in `package.json` should already
   handle this. (15 min)
4. **Publish v0.1.0.** Tag the commit (`git tag v0.1.0 && git push --tags`)
   and the `release.yml` workflow handles the rest. Add the `NPM_TOKEN`
   secret to the repo first. (20 min)
5. **Verify install on a fresh machine.** Borrow a friend's laptop or use
   GitHub Codespaces: `npx trabecc@latest doctor` should work. If not,
   fix it before launch. (30 min)
6. **Pin the install command** to the README and the landing page. They
   already say `npx trabecc@latest`; confirm both still work. (5 min)

**End-of-day check:** `npx trabecc@latest --help` works on a machine
that has never seen this code before.

---

## Day 4 — Run Trabecc on yourself

**Estimated time: 1 hour, but the value is permanent.**

The single highest-credibility move you can make is to *run Trabecc in
front of your own MCP setup*. Every screenshot you'll ever post should be
real data from your own dashboard.

1. Configure your Claude Desktop / Claude Code / Cursor to route through
   Trabecc. Use the production npm install, not a local checkout — eat
   your own dog food.
2. Add 3-4 upstream servers you actually use (filesystem, github,
   whichever).
3. Live in this setup for at least a weekend before launch. You will find
   one bug. Fix it. Cut a v0.1.1.

**End-of-day check:** Your own dashboard at `localhost:4577` shows
real audit records from your real work, not test data.

---

## Day 5 — Build the cold-email list

**Estimated time: 3 hours. The most important 3 hours of the week.**

1. Open a Google sheet with columns: `email | name | company | signal | role`.
2. Find 50 fits via the playbook in `launch/COLD_EMAIL.md`. The first
   filter is GitHub: search for repos importing `@modelcontextprotocol/sdk`
   and find a real human maintainer.
3. Don't send anything yet. Just build the list.

**End-of-day check:** 50 rows, every row has a name + a specific signal
(not "saw your company has AI"). 30 of those should have the email.

---

## Day 6 — Final polish

**Estimated time: 2 hours.**

1. Read the README aloud. Anywhere you stumble, edit. Specifically check:
   the install snippet runs, the Claude Desktop config block is exact, the
   default-deny rationale lands.
2. Take 4 screenshots: the dashboard, the policy file, the CLI doctor
   output, the audit JSON. Store them in `launch/screenshots/`. They go
   in the README and the launch tweets.
3. Write tweets 1-8 (already drafted in `launch/TWITTER_THREAD.md`).
   Schedule them.
4. Re-read `launch/CHECKLIST.md`. Set alarms for tomorrow.

**End-of-day check:** You can describe Trabecc in 12 words. *"A gateway
that audits, polices, and rate-limits AI agent tool calls."* If you can't,
your README is too long.

---

## Day 7 — Pre-launch ping

**Estimated time: 1 hour.**

Don't launch on a Monday — submission timing is wrong. Use Monday to:

1. Email any of the 30 most-promising cold leads with a *pre-launch*
   message: *"Launching this on HN tomorrow. If you'd rather get it
   directly with a 50%-off Pro discount, reply and I'll set you up
   tonight."* Even 2 yeses = $24/mo MRR before launch. More importantly:
   "I have paying customers" is a different launch story than "I have
   none."
2. Write your day-of routine on a single index card: *open HN at 8:25
   to confirm I can post; submit at 8:30; first comment at 8:32; tweet
   at 8:34; reddit at 8:36*. Tape it to your monitor.

---

## Day 8 (Tuesday) — Launch

Run `launch/CHECKLIST.md` from the top. The whole day is in that file.

By 8pm Tuesday, you'll know if Trabecc is going to work as a business.

---

## Critical reminders

- **You do not need a co-founder for this.** Solo OSS-core SaaS launches
  have shipped to $1M ARR many times. The constraint isn't headcount;
  it's clock time + judgment. You have both.

- **You do not need to incorporate yet.** Wait until you have ~$2k MRR or
  a customer that explicitly requires a counterparty entity. Then it's a
  Stripe Atlas Delaware C-corp ($500, 2 days). Premature incorporation
  costs $800/yr in Delaware franchise tax for a year before you make a
  dollar.

- **You do not need to take payments yet.** First 5 paying customers can
  pay by Stripe invoice (one-off invoice link, no subscription system,
  free to set up). Wire the subscription billing on Day 30 when you've
  proven the will-pay signal.

- **You do not need an LLC for the npm publish or the GitHub org.** Both
  are fine under your personal name. Re-attribute later (npm has org
  transfers; GitHub has org renames).

- **Keep the audit log of yourself.** From the moment you launch, screenshot
  every interesting interaction: the first issue filed by a stranger, the
  first cold-email reply, the first paid invoice. These are the assets
  for your eventual *Series A pitch*. Founders who don't do this regret it.

- **The first time someone you don't know files an issue with a real bug
  report — drop everything and ship a fix the same day.** That single
  signal-of-care is worth more than the next 50 cold emails.

---

## Things I deliberately did not build for you

These would have been theater:

- **A Stripe integration.** Until you have a Stripe account and Stripe
  price IDs, code that says `priceIds.pro = "price_xxx"` is a lie. Wire
  it on the day you take the first payment.
- **Sample customer testimonials.** Fake testimonials are worse than no
  testimonials. Delete the `<blockquote>` placeholder on the landing page
  with a real quote from your first paying customer (week 2-3).
- **An e2e cloud backend.** The cloud-sync hook in the OSS is real and
  ready. The other end (the ingest API, multi-tenant DB, signup flow) is
  a 1-week build that should happen *after* you have 5+ people on the
  Pro waitlist. Building it before is overkill — those people will tell
  you what to build.
- **A logo.** The wordmark + the abstract gateway icon I put in the
  landing page are 90% of what you need. Pay a designer $200 for a real
  logo on Day 30, not Day 0.

---

## When you re-read this in 30 days

If you are at:

- > 1000 stars and 0 paid customers → re-read the cold email playbook.
  The OSS is converting attention; you're not converting attention to
  revenue.
- 0 stars and 0 paid customers → the message isn't landing. Talk to 5
  potential users on a phone call (not async). Iterate the README.
- > 5 paid customers → build the cloud control plane. Charge those 5
  before they finish their free trial.
- > 20 paid customers → raise. Not a $5M seed. A $1.5M pre-seed at $8M
  cap, from a single fund that won't dilute you. You're now in a
  position to choose your investor instead of being chosen.

Good luck. Go.
