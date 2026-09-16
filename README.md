# Medisc

A disc golf scorecard web app in the spirit of UDisc: find the course you are standing on, keep score for the whole card, see the course map with tees and baskets, and track your stats over time. Mobile-first, installable as a PWA, hosted on Cloudflare.

## What it does

- **Courses near you** from OpenStreetMap plus the DiscGolfAPI US directory, with a list and map view, radius filter, and place search when location is off.
- **Course pages** with a MapLibre map (streets or satellite), hole lines, tee and basket markers, per-hole par and length, and your record on that course. Courses without mapped holes fall back to a manual editor: set pars, lengths, and tap the map to place tees and baskets.
- **Scorecards** for you and your friends: one hole per screen, big plus and minus buttons, running score to par, live distance to the basket from your phone's GPS, optional throw tracking (fairway, circle 1, circle 2, parked, OB) and hole-by-hole navigation. Rounds autosave and resume.
- **Round history** grouped by month with winner, score grid with birdie and bogey colouring, throw stats, share, edit and delete.
- **Stats dashboard**: form over time, score mix, best rounds, best shots (aces, birdie streaks), fairway hit, circle in regulation, putting and scramble rates, per-course records and head-to-head against cardmates.

Everything is stored on the device in IndexedDB. There is no account. Use Settings to download or restore a JSON backup.

## Stack

React 19, Vite 8, TypeScript, Tailwind 4, react-router, Dexie (IndexedDB), MapLibre GL, Recharts, vite-plugin-pwa. A small Hono Worker proxies and caches Overpass (OpenStreetMap) and the DiscGolfAPI US directory. Served as Cloudflare Workers Static Assets.

## Develop

Uses [Bun](https://bun.sh) for package management and scripts.

```bash
bun install
bun run dev        # http://localhost:5173 with the Worker running locally
bun run test       # vitest: scoring, stats, OSM parsing, geo
bun run typecheck
```

Geolocation needs a secure context. `localhost` works. To test on a phone, expose the dev server over HTTPS:

```bash
bunx cloudflared tunnel --url http://localhost:5173
```

## Deploy to Cloudflare

```bash
bunx wrangler login
bun run deploy     # vite build + wrangler deploy
```

The Worker is named `medisc` in `wrangler.jsonc`. After the first deploy the app is live at `https://medisc.<your-subdomain>.workers.dev`. Add a custom domain from the Worker's settings if you like.

For git-based deploys, connect the repository under Workers & Pages > Create > Connect to Git. The Worker name in the dashboard must match `name` in `wrangler.jsonc`. Build command `bun run build`, deploy command `bunx wrangler deploy`.

## Optional: Google Places for better coverage

The two free sources miss some courses (Blair Mill Park in Stallings, NC, for example). Adding a Google Places key fills those gaps with Google Maps' listings. Text Search sits on the Pro SKU, which includes 5,000 free calls a month; the Worker caches each area for 30 days, so a personal app stays well inside that.

1. In Google Cloud, enable **Places API (New)** and create an API key restricted to it.
2. Locally: create `.dev.vars` containing `GOOGLE_PLACES_KEY=your-key`.
3. Production: `bunx wrangler secret put GOOGLE_PLACES_KEY`.

Without the key the app works exactly as before.

## Data sources and attribution

- Course locations and hole geometry: OpenStreetMap contributors, ODbL, via the Overpass API.
- US course directory: DiscGolfAPI ("Course data supplied by DiscGolfAPI.").
- Basemap: OpenFreeMap (OpenMapTiles). Satellite imagery: Esri World Imagery and partners, for non-commercial use.
- Place search: Nominatim.
- Optional: Google Places (New) for course locations when a key is configured.

Medisc is an independent project and is not affiliated with UDisc.

## Layout of the code

```
worker/index.ts        Hono Worker: /api/overpass proxy, /api/courses/us directory
src/domain/            pure logic: scoring, stats, osm parsing, geo (unit tested)
src/db/                Dexie schema, repositories, live-query hooks
src/services/          overpass, discgolfapi, nominatim, geolocation hook
src/map/CourseMap.tsx  MapLibre wrapper with hole layers and satellite toggle
src/routes/            screens
docs/                  research notes, design spec, implementation plan
```
