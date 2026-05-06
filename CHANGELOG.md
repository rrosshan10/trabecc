# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
