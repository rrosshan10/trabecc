# Launch-day checklist

The order matters. Don't skip steps. Don't go out of order.

## T-7 days (the week before launch)

- [ ] GitHub repo created: `github.com/rrosshan10/trabecc`, public, MIT.
- [ ] Repo pushed with everything in the Trabecc project directory.
- [ ] CI green on `main` (the `.github/workflows/ci.yml` you already have).
- [ ] Trabecc page is live at `trabecc.com` (the
      `TrabeccPage.tsx` component is already wired into the blog repo;
      just deploy the blog to Vercel as you normally do).
- [ ] npm package published. Verify: `npx trabecc@latest --help` works
      from a fresh shell.
- [ ] You can install Trabecc, point Claude Desktop at it, and watch
      the dashboard light up. End-to-end. Yourself. From scratch.

## T-3 days

- [ ] Twitter / X handle: `@trabecc_dev` claimed (or your personal handle
      is fine — pick one and commit).
- [ ] First five GitHub issues filed by you. These are starter-task issues
      labeled `good-first-issue` so contributors have somewhere to land.
- [ ] Discord or GitHub Discussions enabled (Discussions is fine for v0;
      Discord is overkill until you have > 50 users).
- [ ] First 30 cold-email targets identified, in a sheet, with first names
      and a specific signal per row.

## T-1 day

- [ ] Re-read the Show HN copy (`launch/SHOW_HN.md`). Edit nothing on the
      morning of — fix it tonight.
- [ ] Clear your calendar for the launch day (you will be answering
      comments for 4-6 hours).
- [ ] Tell three friends that you're launching tomorrow. Not for upvotes —
      for the moral commitment.
- [ ] Schedule the Twitter thread (Tweet 1 at 8:30am PT). Use Buffer /
      Typefully / a sticky note.
- [ ] Run `npx trabecc@latest doctor` once more. Confirm green.

## T-0: launch day

**8:30am PT**

- [ ] Submit Show HN.
- [ ] Post Tweet 1.
- [ ] Post the r/LocalLLaMA submission.

**8:35am PT**

- [ ] Post your first comment on the HN submission (the one in
      `SHOW_HN.md`).

**The next 4 hours**

- [ ] Reply to every HN comment within 30 minutes.
- [ ] Reply to every Twitter reply within an hour.
- [ ] Track your GitHub stars. Take a screenshot at the 100, 500, 1000
      milestones (you'll want them later).
- [ ] Refresh the `/api/audit` endpoint of your own Trabecc, because
      yes, you should be running it on yourself.

**The afternoon**

- [ ] Send the first 10 cold emails. Personalize each.
- [ ] Quote-tweet your launch tweet from your personal account if it's
      different from `@trabecc_dev`.
- [ ] If a notable person engages on HN/Twitter, DM them with a thank-you
      and an offer of a free pilot.

**Evening**

- [ ] Write the day's results in a private journal. Stars, signups, top
      comment, what surprised you.
- [ ] Sleep. Tomorrow is when the real work starts.

## T+1 to T+7 (the second week)

- [ ] Send 10 cold emails per day. Vary the email by industry once you
      have signal.
- [ ] Ship one bug-fix release in the first week. Bug fixes are content;
      they keep your repo lively in front of new visitors.
- [ ] Open the second-most-asked-for feature as a tracked issue with a
      concrete spec, even if you won't ship it for a month.
- [ ] Reach out to any maintainers of related projects. Offer a free
      cloud account in exchange for honest feedback.

## What "going well" looks like

- Day 1: front page of HN for ≥ 4 hours; > 800 GitHub stars; > 5 cold-email replies.
- Week 1: > 1500 GitHub stars; 1-3 paid pilots verbally agreed.
- Month 1: $1-3k MRR; > 30 cloud signups; one production deployment you
  didn't personally onboard.

## What "needs a pivot in messaging" looks like

- Day 1: < 50 upvotes on HN despite making it to /newest.
  → Your title or first line isn't landing. Test variations on Reddit
    and Twitter; don't resubmit HN within 24h.
- Week 1: stars but zero email replies.
  → People like the idea but don't see themselves as buyers. Re-target the
    ICP. Talk to the few who *did* reply for clues.
- Month 1: < 10 cloud signups despite 1000+ stars.
  → The OSS is "cool but not painful enough." Build the cloud-only feature
    that only the SaaS could do (multi-host audit, anomaly alerts).

## What "this isn't going to work" looks like

- Month 3: < 200 stars total, < 5 GitHub issues filed by non-you, no
  inbound interest. → The category is too early or you're too late. Pivot
  the wrapper, keep the engine; the SQLite-backed audit-log + policy
  primitive is reusable.
