# Deploying RSSB CVS on Vercel (as a PWA)

This guide covers deploying the **RSSB Counter Verification System** to Vercel
as an installable Progressive Web App. The project is pre-configured — you
only need to push to GitHub and import on Vercel. There is no database to
provision: every session is stored locally in the browser's IndexedDB.

---

## 1. Prerequisites

- A GitHub account (free).
- A Vercel account (free tier is enough) — sign up at https://vercel.com.
- The repository pushed to GitHub.

---

## 2. What's already configured

| File | Purpose |
|------|---------|
| `vercel.json` | Framework = Next.js, build command, PWA headers |
| `next.config.ts` | Adds SW/manifest/icon headers |
| `public/manifest.json` | PWA webmanifest (name, icons, shortcuts, theme color) |
| `public/sw.js` | Service worker — offline-first caching (network-first navigations, SWR static) |
| `public/icons/` | `icon.svg`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon.png`, `favicon.ico`, `og-image.png` |
| `src/app/layout.tsx` | PWA metadata (manifest, apple-web-app, theme-color, icons, OG/Twitter cards) + SW registration |
| `src/components/rssb/ServiceWorkerRegister.tsx` | Registers `/sw.js` in production only |
| `src/lib/rssb/indexeddb.ts` | Low-level browser IndexedDB wrapper for session storage |
| `src/lib/rssb/sessionApi.ts` | Session CRUD — reads/writes IndexedDB directly, no network calls |
| `package.json` | `vercel-build` script just runs `next build` — no DB generation step |

---

## 3. Deploy steps

### Option A — Vercel Dashboard (recommended)

1. Push the project to a GitHub repository.
2. Go to https://vercel.com/new and import the repository.
3. Vercel auto-detects Next.js. No environment variables are required.
4. Click **Deploy**. The first build takes ~1-2 minutes.
5. Once deployed, open the URL — the app is now a PWA. Use the browser's "Install" button (Chrome/Edge: address bar icon; Safari iOS: Share → Add to Home Screen).

### Option B — Vercel CLI

```bash
npm i -g vercel
cd rssb-cvs
vercel              # preview deployment
vercel --prod       # production deployment
```

---

## 4. Local development

```bash
npm install
npm run dev         # http://localhost:3000
```

No database setup step is needed — the first time the app runs in a
browser, it creates its own IndexedDB database (named `rssb-cvs`) in that
browser's local storage for the site's origin.

---

## 5. Session storage model (IndexedDB)

All verification sessions — uploaded vouchers, mappings, match results,
cleaning reports, audit logs — are persisted in the browser via
IndexedDB, in an object store called `sessions`, keyed by session `id`.

This means:

- **Nothing is sent to a server.** All processing and storage happens
  entirely client-side, in the user's browser.
- **Data is per-browser, per-device.** Sessions saved in Chrome on one
  machine won't show up in Safari or on a different computer. Use the
  built-in "Export session" (JSON download) / "Import session" features
  in the Sessions Dashboard to move a session between browsers/devices.
- **Clearing browser data clears sessions.** Clearing site data/cache
  for the deployed app's origin will delete all saved sessions, the same
  way it would for any other browser-storage-only web app.
- **No backend, ever.** Because storage lives entirely in IndexedDB,
  this app can be hosted as a plain static/serverless Next.js app on
  Vercel (or any static host) with zero database, zero environment
  variables, and zero ongoing hosting cost for data storage.

---

## 6. PWA

The app is installable as a Progressive Web App:
- manifest:       `public/manifest.json`
- service worker: `public/sw.js` (offline-first caching)
- icons:          `public/icons/` (192, 512, maskable, apple-touch, favicon)
- metadata:       `src/app/layout.tsx` (theme-color, apple-web-app, OG, Twitter)
