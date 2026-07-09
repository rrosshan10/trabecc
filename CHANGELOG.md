# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.6] - 2026-07-10

### Fixed
- One source of truth for the version string (`src/version.ts`). The MCP
  handshake, cloud-sync header, policy-pull header, and admin health endpoint
  previously reported four different versions (0.1.0 / 0.3.1 / 0.1.1).
- Cloud sync treats HTTP 402 (plan limit) as terminal: the batch is dropped
  and the upgrade URL from the cloud is logged, instead of retrying silently.

### Changed
- `trabecc init` next-steps mention the free cloud dashboard.
- README: badges, corrected Node requirement, free-cloud section.

## [0.1.1] - 2026-05-08

### Fixed
- `trabecc admin` no longer errors with `"unable to open database file"` on
  fresh installs. The admin server opens the audit DB read-only; on first
  run (before the gateway has ever written anything) the file doesn't yet
  exist and SQLite refuses to create it in read-only mode. The store now
  bootstraps an empty schema on this path before completing the read-only
  open. Hit during dogfood setup. Regression test added.

## [0.1.0] - 2026-04-30

Initial public release.

### Added
- MCP fan-out gateway: presents one MCP server to the client, multiplexes N
  upstream MCP servers behind it with namespaced tool names (`server__tool`).
- Default-deny policy engine with glob-matched rules and optional
  argument-level `when:` predicates.
- Token-bucket rate limiter, per qualified tool name.
- SQLite-backed audit log, with WAL concurrency, automatic pruning, and
  credential-shaped argument redaction (word-boundary aware).
- Per-call client identification captured from MCP `clientInfo`.
- HTTP admin server with server-rendered HTML dashboard and JSON API
  (`/api/audit`, `/api/stats`, `/api/policy/test`, `/api/config`, `/api/health`).
- CLI subcommands: `run`, `admin`, `init`, `doctor`, `policy check`.
- Optional outbound cloud sync of audit events to a hosted endpoint, with
  batching, retries, and bounded buffer (the wedge for Trabecc Cloud).
- Single-file Dockerfile for running the admin server in a container.
- GitHub Actions CI on every PR (typecheck + unit + e2e smoke).
