# Branding

Single source of truth for everything brand-related: name, tagline, logo, palette, type, voice. Anything that isn't here isn't brand-correct.

---

## Name

**Trabecc** (titlecase) — the brand name used in copy, on the website, in pitches.
**trabecc** (lowercase) — the CLI binary, the npm package, the GitHub org.

Pronounced **"TRAH-bek"** (rhymes with Quebec). Always one word, never abbreviated to "TBC" or "Trab."

The double-c is intentional. Don't "fix" it.

---

## Tagline

**"Trust, but audit."**

Three words. Used as the lockup tagline under the wordmark in marketing surfaces. A riff on Reagan's *"Trust, but verify"* — lands instantly with security/ops/infra readers.

### Hero tagline (longer, descriptive)

**"The gateway for every AI tool call."**

Used as the H1 of the landing page. Slightly more descriptive; pairs with the short tagline.

### Things that are not the tagline

Don't use any of these in marketing — they were considered and rejected:
- ~~"Watch every call."~~ (too literal, sounds surveillance-y)
- ~~"Default-deny for AI agents."~~ (too technical for a landing-page tagline)
- ~~"The control plane for MCP."~~ (locks the brand to one protocol)
- ~~"Boring infrastructure for AI agents."~~ (cute internally, weak externally)

---

## Logo

### Symbol

A stylized **I-beam profile** in the brand accent color. Latin *trabes* = beam; the I-beam is the canonical structural element in engineering. The symbol scales from 16×16 favicon to 256×256 avatar without losing legibility.

Source: [brand/logo-symbol.svg](brand/logo-symbol.svg)
Raster fallbacks: [brand/icon-256.png](brand/icon-256.png), [brand/favicon-32.png](brand/favicon-32.png)

### Wordmark

Symbol + lowercase "trabecc" in system sans (`ui-sans-serif`, font-weight 700, letter-spacing -0.02em).

- [brand/logo-wordmark.svg](brand/logo-wordmark.svg) — for light backgrounds
- [brand/logo-wordmark-dark.svg](brand/logo-wordmark-dark.svg) — for dark backgrounds (the landing page hero, the admin dashboard)

### Logo do's and don'ts

- ✅ Use the symbol alone for tight spaces (favicon, app icon, social avatar).
- ✅ Use the wordmark whenever there's room — the symbol alone is recognizable but the wordmark is what builds name memorability.
- ✅ Maintain at least 8px of padding around the symbol on every side.
- ❌ Don't recolor the I-beam. The accent `#93c5fd` is the brand color.
- ❌ Don't add drop shadows, bevels, or glow effects. The flat geometry is the point.
- ❌ Don't put the symbol over a busy background image. If you must, lay it over a solid `#11151a` rounded rectangle first.
- ❌ Don't squish or rotate the wordmark. The proportions are tuned.

---

## Color palette

### Tokens (codified from landing/dashboard CSS)

| Token | Hex | Used for |
| --- | --- | --- |
| `bg` | `#0b0d10` | Page background |
| `surface` | `#11151a` | Cards, code blocks, the symbol container |
| `border` | `#1f2937` | Card borders, dividers |
| `fg` | `#e5e7eb` | Primary text |
| `fg-dim` | `#9ca3af` | Secondary text, captions |
| `accent` | `#93c5fd` | The brand color. Buttons, the I-beam, links, accents |
| `success` | `#34d399` | "Allowed" outcomes, install command prompt, positive signals |
| `warning` | `#fbbf24` | "Rate limited" outcomes |
| `error` | `#f87171` | "Denied" / "Errored" outcomes |

### Color usage rules

- The **dark theme is the brand**. There is no light-mode landing page. The admin dashboard ships dark-only by design.
- Use `accent` (sky-blue) **sparingly** — for primary CTAs, the symbol fill, and key call-out highlights. If everything is accent-colored, nothing is.
- Use `success` for *positive product states* (allowed call, install prompt). Don't use it as a brand color.
- Use `warning` and `error` for the corresponding audit outcomes. They appear in the dashboard, never on marketing surfaces.

---

## Typography

- **Sans-serif** (UI, body, headlines): `ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif`. System font stack — ships zero font weight, renders native on every OS.
- **Monospace** (code, terminal output, timestamps): `ui-monospace, SFMono-Regular, Menlo, monospace`.
- **Headlines**: weight 700, letter-spacing -0.02em (or -0.025em for the largest H1).
- **Body**: weight 400-500, line-height 1.55.

No Google Fonts. No web fonts. The brand is system-rendered intentionally — fast, no FOUT, identical across surfaces.

---

## Voice

### Principles

1. **Direct over clever.** "The gateway for every AI tool call" beats "Where intelligence meets governance."
2. **Specific over vague.** Use real numbers, real config snippets, real outcome rates. Never "easily" or "seamlessly" or "powerful."
3. **Lowercase by default.** Sentence case for prose; only proper nouns (Trabecc, MCP, Claude, Vercel) and acronyms get capitalized. Especially in tweets, commit messages, dashboard text.
4. **Mild dry humor.** Permitted, when it lands. *"The bug isn't that the LLM made a bad tool call. The bug is that nothing in your stack was watching."*
5. **No AI buzzwording.** Prefer "agent" or "tool call" over "AI" when possible. We don't say "AI-powered" — we say what it does.
6. **No emoji in marketing copy.** Allowed in casual replies on social.

### Words we use

- "gateway" — the canonical noun for what Trabecc is.
- "tool call" — the unit of work the gateway intercepts.
- "audit log" — the persistence story.
- "policy" — the allow/deny rules.
- "default-deny" — the secure-default pattern.

### Words we don't

- ~~"AI-powered"~~ — meaningless.
- ~~"revolutionary"~~ / ~~"game-changing"~~ — never.
- ~~"seamless"~~ / ~~"effortless"~~ — vague.
- ~~"democratizing"~~ — no.
- ~~"unleash"~~ / ~~"empower"~~ — corporate.

### Example: a good 50-word product description

> Trabecc is a default-deny gateway for AI agents. Drop it between Claude Desktop / Cursor / Claude Code (or your own MCP-aware agent) and the upstream MCP servers it calls. Every call is audited; dangerous tools are denied; runaway loops are rate-limited. One YAML file, no agent code changes.

### Example: a bad 50-word product description

> Trabecc is a revolutionary AI-powered governance platform that empowers teams to seamlessly orchestrate intelligent agent workflows with industry-leading security and unmatched observability — democratizing the future of agentic AI.

(One of these is plagiarizable from any seed-stage SaaS landing page. The other is ours.)

---

## Email aliases

| Address | Goes to | Purpose |
| --- | --- | --- |
| `support.team@trabecc.com` | founder inbox | Pro/Team CTA, general inbound |
| `security@trabecc.com` | founder inbox | Vulnerability reports |
| `conduct@trabecc.com` | founder inbox | CoC incidents |

Don't introduce a new alias without updating this table and the IONOS forwarding rules.

---

## Social handles

| Platform | Handle | Status |
| --- | --- | --- |
| GitHub | `github.com/rrosshan10/trabecc` | active |
| npm | `npmjs.com/package/trabecc` | published `0.1.0` |
| X / Twitter | `@trabecc_dev` (pending claim) | reserve before launch |
| LinkedIn (company) | `linkedin.com/company/trabecc` (pending) | reserve when bandwidth allows |
| Discord / Slack | None for v0 | use GitHub Discussions instead |

---

## Things to update if the brand changes

If you ever rename, recolor, or otherwise re-brand:

1. `BRANDING.md` (this file)
2. `brand/*.svg` and `brand/*.png` (regenerate via `npx sharp-cli`)
3. `landing/index.html` — favicon link, og:image, nav logo, hero pill
4. `landing/favicon.svg`, `landing/favicon-32.png`, `landing/og-image.png`
5. `src/admin/dashboard.ts` — header logo
6. `package.json` — name, description, keywords, homepage
7. `README.md` — title, install commands
8. `CHANGELOG.md`, `CHECKLIST.md`, `BUSINESS.md`, `launch/*.md` — wherever the name appears
9. The npm package — publish a new version with the new name; old one becomes legacy
10. The GitHub repo — rename + update remote
11. The domain — buy + redirect old → new

In short: brand changes are expensive once you're public. We did one rename (`agentgate` → `trabecc`) before launch precisely so we wouldn't have to do it after.
