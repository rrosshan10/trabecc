# r/LocalLLaMA self-post

Audience here is technical hobbyists, self-hosters, people running agents
locally. They want tools that respect their hardware and don't phone home
by default. Lead with the self-host angle.

## Title

```
[Project] Trabecc — a self-hosted gateway that audits and rate-limits MCP tool calls before your agent makes them
```

## Body

> If you're running Claude Desktop, Cursor, Claude Code, or your own agent
> against MCP servers, you've probably hit this: you have no idea what tool
> calls your agent actually made today. The protocol gives you no audit log,
> no per-tool quota, no way to deny a single dangerous tool without
> uninstalling the whole server.
>
> I built **Trabecc**. It's a tiny MCP proxy you run locally. From your
> agent's perspective it looks like one MCP server. Internally it fans out
> to all your real ones (filesystem, github, slack, postgres, whatever) and
> intercepts every call.
>
> What it actually does:
>
> * **Default-deny policy.** Tools you haven't explicitly allowed don't
>   appear at all. Glob matching: `filesystem__read_*` allow,
>   `filesystem__write_*` deny.
> * **Argument-level rules.** `deny filesystem__write_* when path: "/etc/*"`.
>   So your agent can't write to `/etc/hosts` even if it really really
>   wants to.
> * **Token-bucket rate limits per tool.** Stop the runaway `web_search`
>   loop before it eats your entire perplexity budget.
> * **Local SQLite audit log.** Every call: who, what, when, allowed/denied,
>   how long it took. Browse the dashboard at `localhost:4577`.
> * **No telemetry.** OSS phones home to nothing unless you set
>   `cloud.apiKey` (then it sends to a hosted service, opt-in only).
>
> Stack: Node 24 + native TypeScript (no build step), `node:sqlite`, Hono.
> One npm package. MIT licensed.
>
> ```
> npx trabecc@latest init
> npx trabecc@latest doctor
> # then add it to claude_desktop_config.json:
> #   "trabecc": { "command": "npx", "args": ["trabecc", "run"] }
> ```
>
> Repo: https://github.com/rrosshan10/trabecc
>
> What I'd love: bug reports, feature requests, and stories about
> MCP-related foot-guns you've hit. The default policy list is built from
> "things I personally would not want my agent to do without asking" —
> contributions to that list welcome.
>
> Not affiliated with Anthropic; this is just an MCP-protocol-level tool.

## Posting rules to remember

- r/LocalLLaMA accepts self-promotion if it's open-source and substantive.
  Lead with the self-host story; never link the paid tier from the post.
- Engage with comments for the first 12 hours. Vote ratio matters here.
- If someone asks "why not [other tool]" — link generously, never disparage.
