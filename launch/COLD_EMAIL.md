# Cold outreach playbook

The first 100 paying customers come from this. Show HN delivers stars; cold
email delivers revenue. Don't skip it.

## Who to target (the ICP)

A team is a fit if **all three** are true:

1. Mid-size or growing — 20 to 500 engineers. Solo devs won't pay; F500 buy
   from gartner-leaderboard vendors, not v0.1 GitHub repos.
2. Shipping AI features in production — not just experimenting. Look for
   "AI/ML/agent" job listings, public AI announcements, MCP-related
   commits in their repos.
3. Has at least one ex-platform-eng or SRE on the team — these are the
   people who recognize "audit log + policy + rate limits" as obviously
   needed.

How to find them:

- GitHub search: `"@modelcontextprotocol/sdk" filename:package.json`
  → identify the company behind the repo, find the maintainer.
- AngelList / Wellfound: filter for AI, Series A/B, US/EU/UK.
- LinkedIn: "AI engineer" + "claude" or "MCP" in the description.
- Hacker News "Who's Hiring" threads — search for "MCP", "agent", "Claude".

Do NOT target:

- Anyone you cannot find a real human's name + email for. Generic
  `info@` addresses convert at 0%.
- Companies with > 1000 engineers on the first pass. They're slower to buy
  and they will absorb your support hours.

## The first email (cold; ~120 words)

> Subject: Trabecc — quick check
>
> Hi {{ first_name }},
>
> I noticed {{ company }} is using MCP — saw {{ specific_signal: e.g.
> "your repo importing @modelcontextprotocol/sdk", "the recent talk on
> $TOPIC", "the Claude integration on your blog" }}.
>
> I'm building Trabecc, the control plane for MCP tool calls. Default-
> deny policy, per-tool rate limits, full audit log of every call your
> agent makes — drops in front of any MCP-aware client (Claude Desktop,
> Cursor, your own agent) without code changes.
>
> Three questions:
>
> 1. Are you tracking what tools your agent is calling today?
> 2. If a tool you didn't expect got called, would you find out?
> 3. Worth a 15-minute walkthrough?
>
> Demo: {{ video_link or repo_link }}
>
> — {{ your_name }}
> {{ link to landing page }}

## Variations

For an open-source maintainer, swap question 3 with:

> 3. Would early access to the cloud product (free) be useful to your
>    project? Happy to ship for whatever you need.

For a CISO or compliance-adjacent contact:

> 1. How are you proving to auditors that your AI agents only call
>    sanctioned tools?
> 2. Do you have a tamper-evident log of agent tool calls?
> 3. (rest as-is)

## The follow-up cadence

- Day 0: send first email (above).
- Day 3: bump with one sentence. *"Hi {{ first_name }} — bumping this in
  case it sank. Anything I can help with?"*
- Day 7: send a *useful* follow-up. *"FWIW, here's a one-line YAML rule
  that catches the most common foot-gun I've seen — `deny fs__write_*
  when path: '/etc/*'`. Even if you don't use Trabecc, putting a rule
  like this in your agent's system prompt is a free win."*
- Day 14: stop. Add to a quarterly newsletter list and move on.

## Honest stats (so your expectations are right)

- 100 sent → ~40 opened → ~12 replied → ~4 took the demo → ~1 paid pilot
  → ~0.7 converted to ARR.
- That ratio improves to ~2-3 paid per 100 sent once your demo is sharp.
- Don't tweak the email until you've sent 100 of the current version.
  Volume teaches you more than wordsmithing.

## What to track

A two-column Google sheet is enough:

| email | company | role | sent | replied | demo | paid | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |

Don't buy a CRM until you have 200 leads in the pipeline.
