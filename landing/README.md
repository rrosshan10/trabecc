# landing/

> **Status:** stand-by. The live Trabecc page currently runs as a route inside
> [trabecc.com](https://trabecc.com)
> (source: `client/src/pages/TrabeccPage.tsx` in the `blog` repo). Deploy
> *this* directory only when you migrate Trabecc to its own domain.

Single-file static site that will become `trabecc.<your-domain>`. No build
step, no JS dependencies. Open `index.html` in a browser to preview locally.

## Deploy

### Cloudflare Pages (recommended)
1. Push this repo to GitHub.
2. In Cloudflare Pages → Create project → connect the repo.
3. Build command: *(leave blank)*. Build output directory: `landing`.
4. Custom domain: your future Trabecc domain (e.g. `trabecc.cloud`).

### Vercel
```sh
cd landing && npx vercel deploy --prod
```
The `vercel.json` handles security headers.

### GitHub Pages
Settings → Pages → Source: deploy from a branch. Folder: `/landing`.

## Editing

The page is intentionally a single self-contained `index.html` file. Critical
copy lives in:

- `<h1>` and `.lede` — the hero pitch
- `#features` — what's built
- `#pricing` — the four-tier ladder
- `<meta>` open-graph tags — social previews

When the cloud product launches, replace the `mailto:` Pro/Team CTAs with the
sign-up URL.
