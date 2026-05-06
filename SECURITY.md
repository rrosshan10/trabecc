# Security policy

## Reporting a vulnerability

**Please do not file public GitHub issues for security bugs.**

Instead, use GitHub's private vulnerability reporting:
[github.com/rrosshan10/trabecc/security/advisories/new](https://github.com/rrosshan10/trabecc/security/advisories/new)

Or email `security@trabecc.com`. Expect an initial response within 72 hours.

## Scope

In scope:
- Anything in this repository (the proxy, the policy engine, the admin server).
- The hosted cloud product (`api.trabecc.com`, `trabecc.com`).

Out of scope:
- Vulnerabilities in upstream MCP servers (`@modelcontextprotocol/server-*`,
  community servers, etc). Please report those to their respective projects.
- Self-inflicted misconfiguration (e.g. binding the admin server to `0.0.0.0`
  on the public internet without auth — by design, Trabecc's admin server
  is local-only by default).

## What we ask

- Give us a reasonable window to fix before public disclosure (90 days
  baseline; faster for actively-exploited issues).
- Do not test against production systems other than your own.

## What we'll do

- Acknowledge within 72 hours.
- Issue a CVE for any meaningful vulnerability.
- Credit the reporter in release notes (unless you prefer otherwise).
