# Deploying RSSB CVS on Vercel (as a PWA)

This guide covers deploying the **RSSB Counter Verification System** to Vercel
as an installable Progressive Web App. The project is pre-configured — you only
need to push to GitHub and import on Vercel.

---

## 1. Prerequisites

- A GitHub account (free).
- A Vercel account (free tier is enough) — sign up at https://vercel.com.
- The repository pushed to GitHub.

---

## 2. What's already configured

| File | Purpose |
|------|---------|
| `vercel.json` | Framework = Next.js, build command, region, PWA headers |
| `next.config.ts` | Detects Vercel env, sets correct `output` mode, adds SW/manifest/icon headers |
| `public/manifest.json` | PWA webmanifest (name, icons, shortcuts, theme color) |
| `public/sw.js` | Service worker — offline-first caching (network-first navigations, SWR static) |
| `public/icons/` | `icon.svg`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon.png`, `favicon.ico`, `og-image.png` |
| `src/app/layout.tsx` | PWA metadata (manifest, apple-web-app, theme-color, icons, OG/Twitter cards) + SW registration |
| `src/components/rssb/ServiceWorkerRegister.tsx` | Registers `/sw.js` in production only |
| `src/lib/db.ts` | Vercel-aware: uses `/tmp/rssb-cvs-prod.db` on serverless (see DB note below) |
| `package.json` | `vercel-build` script runs `prisma generate && next build`; `postinstall` runs `prisma generate` |

---

## 3. Deploy steps

### Option A — Vercel Dashboard (recommended)

1. Push the project to a GitHub repository.
2. Go to https://vercel.com/new and import the repository.
3. Vercel auto-detects Next.js. **Do not override the build command** — it uses `vercel-build` from `vercel.json` which runs `prisma generate && next build`.
4. (Optional) Add environment variables:
   - `DATABASE_URL` — see "Database" section below.
5. Click **Deploy**. The first build takes ~2 minutes.
6. Once deployed, open the URL — the app is now a PWA. Use the browser's "Install" button (Chrome/Edge: address bar icon; Safari iOS: Share → Add to Home Screen).

### Option B — Vercel CLI

```bash
npm i -g vercel
cd rssb-cvs
vercel              # preview deployment
vercel --prod       # production deployment
```

---

## 4. Database considerations

The app uses **Prisma + SQLite**. SQLite writes to the local filesystem, which
is **read-only on Vercel serverless functions** (except `/tmp`, which doesn't
persist across cold starts).

### For a quick demo / personal use
No action needed. `src/lib/db.ts` automatically falls back to
`file:/tmp/rssb-cvs-prod.db` when `VERCEL=1`. Sessions will work during a warm
instance but reset on cold start. Fine for evaluation — not for production.

### For production (persistent data)
Switch the Prisma datasource to a hosted DB. **Turso** (libSQL) is the closest
to SQLite and requires almost no code changes:

1. Create a free Turso DB: https://turso.tech
2. Get your `libsql` connection URL and auth token.
3. Update `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "libsql"
     url      = env("DATABASE_URL")
     directUrl = env("DATABASE_URL")
   }
   ```
4. Install the driver adapter:
   ```bash
   bun add @prisma/adapter-libsql @libsql/client
   ```
5. Set Vercel env vars:
   - `DATABASE_URL` = `libsql://<your-db>.turso.io?authToken=<token>`
6. Run `bun run db:push` locally to sync the schema, then redeploy on Vercel.

**Alternative providers** (also work, with more schema changes):
- Vercel Postgres (`@prisma/adapter-pg`)
- PlanetScale MySQL
- Supabase Postgres

---

## 5. PWA features included

- **Installable** — Add to Home Screen on iOS/Android, Install on desktop Chrome/Edge.
- **Offline-capable** — service worker precaches the app shell; static assets use stale-while-revalidate; navigations are network-first with offline fallback.
- **App shortcuts** — long-press the icon (Android) or right-click (desktop) to see "Upload pharmacy file" and "Open saved sessions" shortcuts.
- **Themed** — status bar matches the brand (indigo in light, navy in dark) on iOS/Android.
- **Maskable icon** — `icon-512-maskable.png` adapts to any Android icon shape.
- **Auto-update** — the SW checks for updates hourly; users get the new version on next reload.

---

## 6. Updating the PWA icons

The icons in `public/icons/` are generated from `public/icons/icon.svg`:

```bash
bun run pwa:icons
```

This uses `sharp` (already a dependency) to render all required PNG sizes +
the OG image. Edit the SVG and re-run the script to refresh every icon.

---

## 7. Downloading the full source as a ZIP

The app has a built-in "Download source" button (landing page hero + footer,
and sessions dashboard header). It calls `GET /api/download-source`, which
streams a ZIP of the entire project (excluding `node_modules`, `.next`, `.git`,
`db`, logs, env files, etc.).

This is handy for:
- Handing the code to another developer.
- Creating a snapshot before a big change.
- Submitting the source for review/audit.

---

## 8. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Build fails on Vercel with `Prisma Client not found` | Ensure `postinstall` script ran. Check Vercel build logs for `prisma generate`. |
| PWA not installable | Verify `/manifest.json` returns 200 with `Content-Type: application/manifest+json` (check `vercel.json` headers). Must be served over HTTPS (Vercel does this automatically). |
| Service worker not registering | Only registers in production builds (`NODE_ENV=production`). Run `vercel --prod`. Check DevTools → Application → Service Workers. |
| Sessions disappear after reload on Vercel | Expected with default SQLite-on-serverless. Switch to Turso (see Database section). |
| Old cached version showing after deploy | The SW bumps `CACHE_VERSION` on each deploy — but users may need one extra reload. The `controllerchange` handler auto-reloads. |
