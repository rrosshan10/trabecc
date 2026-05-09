# TEST.md

> Run-through to verify v0.1.1 is correct in production and the dogfood
> setup works end-to-end. Each section is independent — start at A, work
> down. Estimated total: 30 minutes.

---

## A. Pre-flight — confirm v0.1.1 is what's actually live

```sh
# 1. npm registry shows 0.1.1
npm view trabecc version
# expect: 0.1.1
```

```sh
# 2. Your global install is 0.1.1 (refresh if not)
trabecc --version 2>/dev/null || which trabecc
npm install -g trabecc@latest    # only if step 1 returned 0.1.1 but local is older
```

- [ ] `npm view trabecc version` → `0.1.1`
- [ ] `trabecc --help` (or `npx trabecc@latest --help`) prints the usage screen with no errors

---

## B. Verify the v0.1.1 audit-store fix specifically

This is what made you ship v0.1.1 in the first place — `trabecc admin`
crashed on a fresh install when `~/.trabecc/audit.db` didn't exist yet.
Reproduce the failure scenario and confirm v0.1.1 handles it:

```sh
# Wipe audit DB to simulate a fresh install
rm -f ~/.trabecc/audit.db ~/.trabecc/audit.db-wal ~/.trabecc/audit.db-shm

# Start admin — should NOT error now
trabecc admin
# expect: "INFO admin admin listening on http://127.0.0.1:4577"
# expect: ~/.trabecc/audit.db now exists (bootstrapped empty schema)
```

In another terminal tab:

```sh
ls -la ~/.trabecc/audit.db
# expect: file exists, ~16 KB
```

- [ ] `trabecc admin` starts cleanly with no audit.db pre-existing
- [ ] `~/.trabecc/audit.db` got created with schema applied
- [ ] Dashboard at http://127.0.0.1:4577 loads, shows zero rows ("no audit records yet")

Stop the admin server (`Ctrl+C`) before continuing.

---

## C. CLI smoke tests — every subcommand still works

```sh
# 1. doctor brings up the upstream filesystem MCP server
trabecc doctor
# expect: "filesystem ... ready (14 tools)"
```

- [ ] `trabecc doctor` prints `ready (14 tools)`

```sh
# 2. policy check evaluates correctly against your live config
trabecc policy check filesystem__read_text_file
# expect: ALLOW filesystem__read_text_file

trabecc policy check filesystem__write_file
# expect: ALLOW filesystem__write_file
#         (writes outside /etc and outside Agent Gate are allowed)
```

- [ ] Policy ALLOWs reads
- [ ] Policy ALLOWs writes (rule fall-through)

```sh
# 3. argument-level deny via --config
# (we can't test arg-level rules from `policy check` alone since it doesn't
#  take args; covered in Section E below where Claude actually sends args)
```

```sh
# 4. init writes a config in a fresh directory
mkdir -p /tmp/trabecc-init-test && cd /tmp/trabecc-init-test
trabecc init
ls trabecc.yaml
cd - && rm -rf /tmp/trabecc-init-test
```

- [ ] `trabecc init` writes a fresh `trabecc.yaml`

---

## D. Admin dashboard — first impression check

Start the admin server. Open the dashboard. Confirm it looks
brand-correct (post-v1 brand work).

```sh
trabecc admin    # leave running
```

Then in your browser open http://127.0.0.1:4577.

- [ ] Header shows the **Trabecc I-beam symbol** (not a placeholder arrow)
- [ ] Title bar shows "Trabecc"
- [ ] Stats cards render: Total / Allowed / Denied / Rate limited / Errored
- [ ] "Recent calls" section says "no audit records yet" (expected — still empty)
- [ ] Auto-refresh works (page refreshes every 5s)

---

## E. End-to-end through Claude Desktop — the actual dogfood

Before this section, **completely quit and restart Claude Desktop** (⌘Q
then reopen). On first launch it'll npx-install `trabecc@latest` —
takes 10-30s. After that, the gateway is wired in.

Keep `trabecc admin` running in another terminal. Refresh the dashboard
between each test.

### E.1 — Allowed read (expected: `allowed`)

In Claude Desktop, ask:

> "Read the file /Users/roshan/Documents/Agent Gate/README.md and summarize its first paragraph."

- [ ] Claude responds with a summary
- [ ] Dashboard shows a new row: `filesystem__read_text_file` · `allowed`
- [ ] Row's "Agent" column shows `claude-ai@<version>` (or similar)
- [ ] `args` column shows the file path (not redacted)

### E.2 — Allowed directory listing (expected: `allowed`)

> "List all files and folders inside /Users/roshan/Documents/Agent Gate/src."

- [ ] Dashboard shows: `filesystem__list_directory` or `directory_tree` · `allowed`

### E.3 — Argument-level deny: /etc (expected: `denied`)

> "Create a file at /etc/test-from-claude.txt with the content 'hello'."

- [ ] Claude reports the call was denied
- [ ] Dashboard shows: `filesystem__write_file` · **`denied`**
- [ ] Reason: `"no writes under /etc"`
- [ ] **Take a screenshot now** — this is launch-asset material

### E.4 — Argument-level deny: this repo (expected: `denied`)

> "Create a file called scratch.txt inside /Users/roshan/Documents/Agent Gate."

- [ ] Dashboard shows: `filesystem__write_file` · **`denied`**
- [ ] Reason: `"no Claude-driven writes inside the Trabecc repo"`

### E.5 — Allowed write outside the repo (expected: `allowed`)

> "Write a file at /Users/roshan/Documents/scratch-trabecc-test.txt with one paragraph describing what Trabecc does."

- [ ] Dashboard shows: `filesystem__write_file` · `allowed`
- [ ] The file actually exists on disk: `ls /Users/roshan/Documents/scratch-trabecc-test.txt`

(Clean up: `rm /Users/roshan/Documents/scratch-trabecc-test.txt`)

### E.6 — Rate limit smoke (optional; expected: maybe `rate_limited`)

> "Read every .ts file in /Users/roshan/Documents/Agent Gate/src and tell me which one has the most lines."

This triggers ~16 rapid file reads. Burst limit is 30 / minute.
You may or may not hit `rate_limited`; either is fine.

- [ ] If rate-limited: dashboard shows at least one `rate_limited` row
- [ ] If not: that's expected too; the limit just wasn't tight enough

---

## F. Production website checks — trabecc.com

```sh
# 1. apex resolves and redirects www
curl -sSI https://trabecc.com 2>&1 | head -3
# expect: HTTP/2 307 → location: https://www.trabecc.com/

# 2. www serves the landing page
curl -sSI https://www.trabecc.com 2>&1 | head -3
# expect: HTTP/2 200, server: Vercel

# 3. landing page contains the new tagline + I-beam favicon refs
curl -sSL https://www.trabecc.com 2>&1 | grep -E 'Trust, but audit|favicon\.svg|og-image'
# expect: hero pill, favicon link, og:image meta

# 4. og:image actually serves
curl -sSI https://www.trabecc.com/og-image.png 2>&1 | head -3
# expect: HTTP/2 200, content-type: image/png
```

- [ ] `trabecc.com` redirects to `www.trabecc.com`
- [ ] `www.trabecc.com` returns 200 with the landing page
- [ ] "Trust, but audit." appears in the hero pill
- [ ] `og-image.png` returns 200

In a browser:

- [ ] Open `https://trabecc.com` — landing page loads cleanly over HTTPS
- [ ] **Tab favicon** shows the I-beam symbol (not a generic globe)
- [ ] Click each `mailto:` CTA — your mail client opens with the right subject
- [ ] Click "Get started on GitHub" — goes to `github.com/rrosshan10/trabecc`

### F.1 — Social preview test

Paste `https://trabecc.com` into a Slack DM (or any channel where you can
delete it after).

- [ ] Slack unfurls the URL into a card with: title, description, the
      Trabecc OG image showing "Trust, but audit." and "trabecc.com"
- [ ] Image is sharp (not pixelated) at preview size

---

## G. npm registry surface

```sh
npm view trabecc
```

- [ ] `version: 0.1.1`
- [ ] `description` matches the brand voice
- [ ] `homepage: https://trabecc.com`
- [ ] `repository: github.com/rrosshan10/trabecc`
- [ ] `license: MIT`
- [ ] `bin` lists `trabecc`
- [ ] `dependencies` are reasonable (6 deps, all expected)

In a browser, visit https://www.npmjs.com/package/trabecc:

- [ ] README renders with no broken markdown / images
- [ ] CI badge (if added) shows green
- [ ] Maintainer shows `rrosshan10` (and/or org)

---

## H. GitHub repo surface

In a browser, visit https://github.com/rrosshan10/trabecc:

- [ ] Repo is public
- [ ] README renders cleanly
- [ ] CI badge on the repo's latest commit shows ✅ (green)
- [ ] `releases/tag/v0.1.1` exists with notes (auto-generated by release.yml
      *if* the tag-publish path worked; otherwise create manually)
- [ ] Issues are enabled
- [ ] About panel shows: description, `trabecc.com` link, topics tags

### H.1 — GitHub social preview

In another browser tab, paste `https://github.com/rrosshan10/trabecc`
into a Slack DM:

- [ ] Slack unfurls a GitHub card with the README's first paragraph
- [ ] If you uploaded `brand/og-image.png` to repo Settings → Social
      preview, Slack shows the Trabecc card instead of the default GitHub
      avatar grid

---

## I. The four launch screenshots — capture after dogfood data accrues

After Section E + a few hours of natural Claude Desktop usage, your
dashboard should have 30+ real audit rows. Then take these:

1. **Dashboard overview** — full page at `localhost:4577` showing
   populated stats cards and recent calls. Aim for a mix of `allowed`,
   `denied`, and ideally one `rate_limited` row.
2. **A specific denied call** — drill into the args/reason for a
   `denied` row from Test E.3 or E.4. Shows the `when:` predicate
   working with real Claude-generated arguments.
3. **The policy YAML** — open `~/.trabecc/config.yaml` in your editor
   (with syntax highlighting). The rules section is the visual.
4. **The CLI doctor output** — `trabecc doctor` printed to a clean
   terminal. Shows the upstream filesystem coming up with its 14 tools.

Save them in `launch/screenshots/`. They go in:
- The README (replace any "screenshot coming soon" placeholders)
- The Show HN first comment (link to the dashboard image)
- The Twitter launch thread (image attachments on tweets 4-6)

---

## J. Bugs to watch for during dogfood

If you hit any of these during the next 24-48 hours, file an issue
*on yourself* (not just a mental note — actually create a GitHub issue):

- [ ] Tools you expected to work showed up as `denied` because policy
      was too narrow
- [ ] Rate limit fires when you didn't expect it
- [ ] Dashboard auto-refresh stutters on a slow upstream
- [ ] Args column truncates important context (paths, IDs)
- [ ] Specific tool calls error with cryptic messages
- [ ] `trabecc admin` consumes noticeable CPU when idle
- [ ] Audit DB grows surprisingly fast for normal usage

Each one is a v0.1.2 candidate. Bug fixes ship daily during launch
week — they signal "alive" to early users.

---

## K. Final pass before launch

When sections A-I all check out:

- [ ] Open https://trabecc.com on a real iPhone or Android — confirm
      mobile responsive (not just Chrome devtools)
- [ ] Open https://trabecc.com on someone else's machine (a coworker's,
      a coffee shop laptop) — confirms it's actually live to the
      internet, not just to your DNS cache
- [ ] Send a test email from your phone to `support.team@trabecc.com`
      — confirm it lands in your inbox
- [ ] Restart your laptop, then run `npx trabecc@latest doctor`
      — confirm it works on a "cold" machine state
- [ ] Type your one-sentence pitch out loud in front of a mirror.
      "Trabecc is the gateway between your AI agent and your tools.
      Trust, but audit." If you can't say it confidently, edit until
      you can.

When all of section K is checked: you're ready for Phase 4 (cold-email
list) and Phase 7 (pre-launch ping).
