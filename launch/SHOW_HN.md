# Hacker News submission

## Title (80 chars max — this one is 71)

```
Show HN: Trabecc – an open-source MCP gateway for AI tool calls
```

## URL

```
https://github.com/rrosshan10/trabecc
```

(GitHub link, not the landing page. HN voters trust repos more than marketing
pages, and the README does the work the landing page would.)

## Submitter's first comment (post immediately after submission)

> Hi HN — I built Trabecc because every team I know that's adopted MCP has
> the same three problems by month two: they don't know which tools their
> agents are calling, they have no audit trail, and one tool that should
> have been read-only is happily running `rm -rf` somewhere.
>
> Trabecc sits between the MCP client (Claude Desktop, Cursor, Claude Code,
> a custom agent — anything that speaks MCP) and the upstream MCP servers
> it talks to. From the client's perspective Trabecc is one MCP server.
> Internally it fans out to all your real upstreams, namespaces their tools
> (`github__search_issues`, `filesystem__read_file`), and intercepts every
> call. Default-deny policy, glob-matched rules with optional argument-level
> predicates (`deny filesystem__write_* when path matches /etc/*`), per-tool
> rate limits, SQLite audit log, server-rendered dashboard.
>
> A few specific design choices I'd value pushback on:
>
> * **Default-deny.** Tools you haven't allowed don't appear in the catalog
>   at all. The argument is that the cost of a benign blocked call is one
>   line of YAML; the cost of a bad accidental call is unbounded.
> * **Word-boundary credential redaction.** The default redactor masks any
>   key whose segments contain `password`, `token`, `api_key`, etc. A
>   `path` argument is *not* redacted (segments are `["path"]`, not `pat`).
>   `github_pat` is.
> * **Cloud is one config flag.** The hosted product is the same code with
>   `cloud.apiKey` set. OSS works fully without it.
>
> Stack is Node 24 native TypeScript (no build step), `node:sqlite`, Hono.
> Runs anywhere Node runs. License is MIT.
>
> Install:
>
>     npx trabecc@latest init
>     npx trabecc@latest doctor
>
> Then point Claude Desktop / Cursor / your client at `trabecc run`.
>
> Repo: https://github.com/rrosshan10/trabecc · Docs: README.
>
> Happy to dig into the design tradeoffs in the comments. What I'd most love:
> stories of MCP-related foot-guns you've hit, so I can build the right next
> features.

## Pre-submission checklist

- [ ] Repo has > 0 commits visible on the front page
- [ ] README renders correctly (no broken images, links)
- [ ] `npm install -g trabecc` actually works (you've published)
- [ ] CI badge is green
- [ ] LICENSE file is present and named correctly
- [ ] First three "issues" filed by you (not blockers — discoverable starter
      issues for early contributors)

## Timing

Submit Tuesday or Wednesday, **8:30am Pacific** (that's 11:30am Eastern,
4:30pm UK, late evening EU). HN front-page mechanics favor early-day
weekday US submissions. Avoid Mondays (catch-up traffic) and Fridays.

## Comment hygiene

- Reply to every substantive comment within 30 minutes for the first four
  hours. The "show submitter is here" signal disproportionately drives
  upvotes early.
- Never argue. If someone's wrong, ask a clarifying question.
- If someone asks for a feature, the right answer is almost always
  "filed: \<link to issue\>". File the issue *while you reply*.
- If a competitor or related project comes up, link to them generously.
  HN rewards generosity.

## Anti-patterns to avoid

- Asking for upvotes anywhere (instant flag-and-kill)
- Submitting from a brand-new HN account (use one with prior comments)
- Multiple submissions of the same URL within 24h (HN dedupes; resubmits
  burn karma)
- Editing the title or first comment after the first 30 minutes
