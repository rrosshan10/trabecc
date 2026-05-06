# Launch thread (X / Twitter)

Eight tweets. The job of the thread is not to convert; it's to give people
who already follow you something to retweet, and to give a screenshot to
people who want to send the link to a coworker. Keep the GitHub link in the
last tweet, not the first — Twitter de-ranks link-leading tweets.

---

**1/**

Every team adopting MCP discovers the same problem 3 months in:

- agents call too many tools
- nobody knows who can call what
- there's no audit log
- one bad call is unbounded

I built the thing that fixes it.

**2/**

Meet Trabecc.

It sits between your MCP client (Claude Desktop, Cursor, Claude Code, your
custom agent) and the upstream MCP servers it talks to.

To your agent: it looks like one MCP server.

To you: it's the control plane your agents have been missing.

**3/**

Default-deny policy. Tools you haven't allowed don't appear at all.

```yaml
rules:
  - match: "filesystem__read_*"
    effect: allow
  - match: "filesystem__write_*"
    effect: deny
    when: { path: "/etc/*" }
```

Your agent literally cannot write to `/etc/hosts`. By design.

**4/**

Audit log on every call. SQLite, ships with the binary. Records the calling
client, redacts credential-shaped args (word-boundary aware — `path` doesn't
get falsely redacted by `pat`).

[screenshot of the dashboard]

**5/**

Per-tool rate limits. Token bucket. The runaway `web_search` loop that ate
your $400 Perplexity budget last month? Capped at 60/min before it starts.

**6/**

Stack:

- Node 24 native TypeScript (no build step)
- `node:sqlite` (no native deps)
- Hono for the admin API
- Single npm install

Installs in 30 seconds. Self-hosts in 60.

**7/**

Open-source from day one (MIT). Cloud retention + alerting + team
dashboards are coming, but the OSS works fully without ever phoning home.

The same code. One config flag is the only difference.

**8/**

If you're running an agent against MCP servers in production, you should be
running Trabecc in front of it.

If you're not yet — file the issue with the use case and I'll build it.

→ github.com/rrosshan10/trabecc

---

## Cadence

- **Tweet 1** at 8:30am PT alongside the Show HN submission.
- **Tweet 8 (with the link)** as a quote-tweet of tweet 1 four hours later
  to surface the thread for evening EU / morning Asia readers.
- Pin tweet 1 to your profile for the launch week.
