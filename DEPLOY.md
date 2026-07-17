# Deploying RSSB CVS (Vite SPA) on Vercel

This is a plain static single-page app — a Vite + React build with no
server, no API routes, and no database. Every session is stored locally
in the browser's IndexedDB.

## Local development

```bash
npm install
npm run dev       # http://localhost:3000
```

## Production build

```bash
npm run build     # outputs static files to dist/
npm run preview   # serve the production build locally to sanity-check it
```

## Deploy on Vercel

1. Push this folder to a GitHub repository.
2. Import the repo at https://vercel.com/new.
3. Vercel will detect `vercel.json` (build command `npm run build`,
   output directory `dist`) — no environment variables or database setup
   needed.
4. Deploy. The app is a PWA — install it from the browser on any device.

`vercel.json` also includes a SPA fallback rewrite so client-side
navigation and refreshes on any path serve `index.html` correctly.

## Deploy anywhere else

Since this is a static build, `dist/` can be hosted on literally any
static host (Netlify, Cloudflare Pages, GitHub Pages, S3 + CloudFront, or
just a plain nginx server) — just make sure unknown paths fall back to
`index.html` (standard SPA rewrite) and that `.js` chunk files aren't
cache-busted (they already have content hashes in their filenames).

## Session storage model (IndexedDB)

All verification sessions (uploaded vouchers, mappings, match results,
cleaning reports, audit log) are persisted in the browser via IndexedDB,
in an object store called `sessions`, keyed by session `id`.

- Nothing is sent to a server — all processing and storage is client-side.
- Sessions are per-browser/per-device. Use "Export session" (JSON
  download) / "Import session" in the Sessions Dashboard to move a
  session between browsers or machines.
- Clearing browser site data for the deployed origin clears all sessions.

## Performance notes

- Heavy, infrequently-visited views (Analytics, Dashboard, Network Graph,
  Compare, Counter Verification, Audit Log, Hospital, Match Review, Map)
  are code-split with `React.lazy` and only download when the user
  navigates to that stage.
- `recharts`, `d3-force`, `@dnd-kit/*`, `framer-motion`, and
  `xlsx-js-style` are split into their own vendor chunks so they're
  cached independently of app code changes.
- Vite's esbuild-based dev server gives near-instant HMR compared to the
  previous Next.js dev server.
