# Contributing to Trabecc

Thanks for considering it. The project is small enough that one good PR can move the roadmap.

## Quick start

```sh
git clone https://github.com/rrosshan10/trabecc
cd trabecc
npm install
cp trabecc.example.yaml trabecc.yaml
node src/cli.ts doctor
```

Requires Node 24+ (we use the native TypeScript runtime and `node:sqlite`).

## Repo layout

| Path | What lives here |
| --- | --- |
| `src/cli.ts`, `src/main.ts` | CLI entry; subcommand dispatch |
| `src/proxy/` | The MCP fan-out gateway |
| `src/policy/` | Policy engine (glob + argument predicates) |
| `src/ratelimit/` | Token-bucket rate limiter |
| `src/audit/` | SQLite audit store + redaction + cloud sync |
| `src/admin/` | HTTP admin API + dashboard |
| `tests/` | `node --test` unit tests + e2e smoke |
| `landing/` | Static marketing site |

## Running checks

```sh
npx tsc --noEmit                                          # typecheck
node --test tests/policy.test.ts tests/namespace.test.ts \
  tests/ratelimit.test.ts tests/redact.test.ts \
  tests/cloud_sync.test.ts                                # unit tests
node tests/e2e.smoke.ts                                   # e2e smoke
```

CI runs all three on every PR; please make sure they're green locally first.

## Code style

- No build step. We rely on Node 24's strip-types mode, which forbids parameter-property
  shorthand in constructors — declare the field, then assign it in the body.
- Stdout is reserved for the MCP wire protocol when running `trabecc run`. All
  diagnostic output must go to stderr (use `createLogger(...)`).
- Add a test for any non-trivial logic. We are tiny — keep us tiny on purpose.
- Comments earn their place: explain *why*, not *what*.

## Filing PRs

- Title in imperative mood ("Add per-agent quotas", not "Added per-agent quotas").
- Keep PRs focused. A 200-line PR that does one thing well merges in a day; a 2,000-line
  PR that does five things waits a week.
- Reference issues with `Closes #N` so they auto-close on merge.

## Releasing (maintainers only)

1. Bump `version` in `package.json`.
2. Tag: `git tag v0.x.y && git push --tags`.
3. The `release.yml` workflow publishes to npm with provenance.
