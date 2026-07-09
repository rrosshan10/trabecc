# Trabecc

> The gateway and governance layer for MCP. Audit, policy, and rate-limiting for every AI tool call.

[![CI](https://github.com/rrosshan10/trabecc/actions/workflows/ci.yml/badge.svg)](https://github.com/rrosshan10/trabecc/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/trabecc)](https://www.npmjs.com/package/trabecc) [![license](https://img.shields.io/badge/license-MIT-dc143c)](LICENSE)

Trabecc sits between your MCP client (Claude Desktop, Cursor, Claude Code, Continue, Cline, Zed, your own agent) and the MCP servers it talks to. From the client's perspective Trabecc **is** an MCP server — one server, presenting a single namespaced tool list. Internally it fans out to every upstream MCP server you've configured and intercepts every call.

```
   ┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
   │   MCP client     │───────▶│   Trabecc      │───┬───▶│  filesystem MCP  │
   │ (Claude Desktop, │  MCP   │  policy, audit,  │   ├───▶│  github MCP      │
   │  Cursor, …)      │        │  rate limits     │   └───▶│  slack MCP       │
   └──────────────────┘        └──────────────────┘        └──────────────────┘
                                       │
                                       ▼
                               SQLite audit log
                                       │
                                       ▼
                            Admin dashboard / API
```

## What it does in v0

- **Fan-out proxy** — one MCP endpoint multiplexed over N upstream servers, with tool names namespaced as `<server>__<tool>`.
- **Allow/deny policy** — glob-matched rules, evaluated top-to-bottom; deny by default.
- **Argument-level rules** — `when:` predicates gate by call args (e.g. deny `fs__write_*` when `path: "/etc/*"`).
- **Rate limits** — token bucket per qualified tool name.
- **Audit log** — SQLite, every attempt: allowed, denied, rate-limited, error. Records the calling client (MCP `clientInfo`) on each row.
- **Argument redaction** — credential-shaped keys (`password`, `api_key`, `authorization`, `pat`, `private_key`, …) are stored as `[REDACTED]` before persistence. Word-boundary aware (so `path` is not redacted by the `pat` keyword).
- **Admin dashboard** — server-rendered HTML at `/` with live stats and recent calls; auto-refresh.
- **Admin HTTP API** — recent calls, stats by outcome, top tools, policy preview.
- **`doctor` subcommand** — bring up every upstream once and report status.

## Install

Requires Node.js 22.5+ for the published package (built-in `node:sqlite`); Node 24+ to run from source (native TypeScript stripping).

```bash
npm install -g trabecc
trabecc init       # writes ./trabecc.yaml
trabecc doctor     # verify every upstream starts
```

## Wire it to your client

### Claude Desktop / Claude Code

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "trabecc": {
      "command": "npx",
      "args": ["trabecc", "run"]
    }
  }
}
```

After this, every tool from every upstream MCP server you list in `trabecc.yaml` shows up in Claude under `<server>__<tool>` names. Restart the client.

### Cursor / Continue / Cline / Zed

Same idea — point the MCP server entry at `trabecc run`. The wire format is plain MCP stdio.

## Config

```yaml
defaultPolicy: deny           # secure default — opt in to tools

servers:
  - name: filesystem
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]

rules:
  - match: "filesystem__read_*"
    effect: allow
  # Argument-level rule: deny writes whose path looks like /etc.
  - match: "filesystem__write_*"
    effect: deny
    when:
      path: "/etc/*"
    reason: "no writes under /etc"
  - match: "filesystem__write_*"
    effect: deny
    reason: "writes require human review"

rateLimits:
  - match: "filesystem__*"
    perMinute: 120
    burst: 30
```

Search order: `./trabecc.yaml` → `./trabecc.yml` → `~/.trabecc/config.yaml` → `~/.config/trabecc/config.yaml`. Override with `--config <path>`.

## Commands

| Command | Purpose |
| --- | --- |
| `trabecc run` | Start the gateway on stdio. Wired into your MCP client. |
| `trabecc admin` | Start the HTTP admin server (default `http://127.0.0.1:4577`). |
| `trabecc init` | Write an example `trabecc.yaml`. |
| `trabecc doctor` | Spawn every upstream once and print status. |
| `trabecc policy check <tool>` | Evaluate a qualified tool name against current policy. |

## Admin

`trabecc admin` exposes a server-rendered HTML dashboard at `/` (auto-refreshing every 5s) and the following JSON API:

- `GET /api/health`
- `GET /api/config`
- `GET /api/audit?limit=&offset=`
- `GET /api/stats?windowMinutes=`
- `GET /api/policy/test?tool=<qualified>`

Dashboard query params: `?windowMinutes=60&limit=50&refresh=5`.

Bound to `127.0.0.1` by default. Do not expose publicly without putting auth in front.

## Why default-deny

Your agent will run thousands of tool calls a day. The expected value of a single bad call (`fs__delete_file`, `slack__post_message`) is wildly negative; the cost of a denied benign call is a one-line policy edit. Default-deny is the only configuration that doesn't get someone fired.

## Free cloud dashboard (optional)

The OSS never phones home. If you want multi-host dashboards, retention, and
centrally managed policies, get a free API key at
[api.trabecc.com/signup](https://api.trabecc.com/signup) (1 host, 1,000
events/day, no card required), then set `cloud.enabled: true` and
`cloud.apiKey` in your `trabecc.yaml`.

## License

MIT.
