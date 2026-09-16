# Cloudflare hosting and front-end stack

Research notes gathered 2026-09-16 from developers.cloudflare.com and the npm registry.

## Hosting: Workers with Static Assets

Cloudflare's Pages landing page now says to start new projects with Workers. Workers static assets serve a Vite `dist/` folder, requests for static assets are free and unlimited, and a Worker can later be attached for an API.

Scaffold: `npm create cloudflare@latest -- medisc --framework=react`. Scripts: `npm run dev` (vite dev with workerd), `npm run build`, `npm run deploy` (build then `wrangler deploy`).

Pure SPA config (`wrangler.jsonc`):
```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "medisc",
  "compatibility_date": "2026-09-16",
  "assets": { "not_found_handling": "single-page-application" }
}
```
With `@cloudflare/vite-plugin` the `assets.directory` is filled in from the Vite build. Without the plugin set `"directory": "./dist/"`.

SPA plus API Worker: add `"main": "./worker/index.ts"`, `"binding": "ASSETS"`, and `"run_worker_first": ["/api/*"]` so only API paths invoke the Worker.

`public/_headers` is copied to dist and applies to static assets only. Suggested:
```
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(self), camera=(), microphone=()
```

Git-based deploys: connect the repo under Workers Builds. Worker name in the dashboard must equal `name` in wrangler.jsonc.

## Versions (npm latest on 2026-09-16)

| Package | Version | Note |
|---|---|---|
| wrangler | 4.132 | Node >= 22 |
| @cloudflare/vite-plugin | 1.54 | Vite 6–8 |
| react / react-dom | 19.3 | |
| vite | 8.3 | Rolldown bundler |
| @vitejs/plugin-react | 6.1 | Oxc, needs Vite 8 |
| tailwindcss / @tailwindcss/vite | 4.3 | theme in CSS via `@theme` |
| react-router | 8.4 | ESM only, import from `react-router` |
| maplibre-gl | 6.10 | ESM only, WebGL2, needs `setWorkerUrl` with Vite |
| react-map-gl | 8.1 | `react-map-gl/maplibre` |
| recharts | 3.10 | |
| dexie / dexie-react-hooks | 4.4 | |
| vite-plugin-pwa | 1.3 | Vite 8 support |
| lucide-react | 1.46 | |
| date-fns | 4.4 | |
| hono | 4.13 | |
| drizzle-orm / drizzle-kit | 0.45 / 0.31 | |
| shadcn CLI | 4.21 | Base UI default primitive |
| typescript | 7.0 | Go-based compiler |

## Persistence recommendation

Start client-only with Dexie (IndexedDB). Design the schema for later sync: client-generated UUID keys, `updatedAt` on every row, soft-delete tombstones. Rounds are played outdoors with poor signal, so local-first is correct regardless of backend.

Later sync options: Dexie Cloud (3 production users free) or a D1 + Hono `POST /api/sync` endpoint with last-write-wins on `updatedAt`. Durable Objects fit a live shared scorecard between phones (v2).

Dexie 4 sketch:
```ts
import { Dexie, type EntityTable } from "dexie";
export const db = new Dexie("medisc") as Dexie & {
  rounds: EntityTable<Round, "id">;
  holeScores: EntityTable<HoleScore, "id">;
};
db.version(1).stores({
  rounds: "id, courseId, startedAt, *playerIds, updatedAt",
  holeScores: "id, roundId, playerId, holeId, [roundId+playerId], [roundId+holeId], updatedAt",
});
```
`useLiveQuery` from dexie-react-hooks re-renders on writes.

## Auth options (later)

- Cloudflare Access with One-time PIN. Free for 50 users. Workers dashboard has a "Protect this Worker behind Access" toggle. Zero app code.
- better-auth on D1 via Hono for real accounts.
- Lucia is deprecated. Do not add it.

## MapLibre 6 with Vite

```ts
import { setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
setWorkerUrl(workerUrl);
```
Constructor throws `GPUInitializationError` without WebGL2. Wrap in try/catch.

## Geolocation gotchas

- Needs a secure context. `localhost` is fine. A phone hitting `http://192.168.x.x:5173` is not. Use `cloudflared tunnel --url http://localhost:5173` for phone testing.
- Default Permissions-Policy allows geolocation for same origin. Do not write `geolocation=()`.
- Workbox `navigateFallbackDenylist: [/^\/api\//]` so offline API calls do not receive index.html.
- iOS home-screen PWAs stop `watchPosition` when the screen locks. Use `{ enableHighAccuracy: true, maximumAge: 5000 }` while a scorecard is open.

## Charts

Recharts 3 for score trend lines, per-hole averages, and score distribution bars. Chart.js is lighter for many points; not needed here.

## Component library

shadcn/ui CLI 4 with Base UI default. `npx shadcn@latest init -t vite`. Sheet/Drawer for bottom sheets, Tailwind `pb-[env(safe-area-inset-bottom)]` for the iPhone home bar.
