# Medisc design spec

Date: 2026-09-16
Status: approved for implementation (decisions made autonomously under the session goal; research in `docs/research/`).

## 1. Goal

A mobile-first web app for disc golf players, modelled on UDisc, hosted on Cloudflare. A player opens it on their phone at a course, finds the course from their GPS location, starts a round with friends on one scorecard, scores hole by hole with the course map alongside, and afterwards reviews round history and a statistics dashboard.

Not in scope for v1: accounts and sync between devices, leagues/events, community feed, disc bag, measure throw, reviews/ratings of courses, live multi-phone scorecards.

## 2. Decisions and reasons

| Decision | Choice | Why |
|---|---|---|
| Hosting | Cloudflare Workers with Static Assets, via `@cloudflare/vite-plugin` | Cloudflare's stated recommendation for new projects. Static requests are free. A Worker can be attached later. |
| Backend | A small Hono Worker exposing `/api/overpass` (cached proxy) only | Overpass public instances rate-limit to 2 concurrent per IP and fail under load. A proxy with Cache API smooths that. Everything else is client-side. |
| Persistence | Local-first IndexedDB via Dexie 4 | Courses have poor signal. No auth to build. Schema uses UUID keys, `updatedAt`, tombstones so sync can be added later. |
| Course data | OpenStreetMap via Overpass, with manual course editor fallback | Only legal free source with tee/basket coordinates. US coverage of holes is sparse, so users must be able to set hole count, pars, and pins themselves. |
| Basemap | OpenFreeMap `liberty` vector style, satellite toggle using Esri World Imagery raster | No keys, no limits. Esri imagery is CORS-open and fine for a personal app with attribution. |
| Map library | MapLibre GL JS 6, plain (no react-map-gl) | Handful of markers. Fewer moving parts. |
| UI stack | React 19, Vite 8, TypeScript, Tailwind 4, react-router 8 | Current stable versions. |
| Charts | Recharts 3 | Simple, React-native components, fine for trend lines and distributions. |
| PWA | vite-plugin-pwa, autoUpdate, installable | Home-screen icon, offline shell. |
| Tests | Vitest for pure logic (stats, scoring, OSM parsing, geo) | The logic is where bugs hurt. UI is verified in browser. |
| Scoring modes | Scores-only (+/-) always. Optional per-hole throw tracker (zone chips) for any player | Throw zones power the "best shots" style stats without GPS pin complexity. |
| Ratings | No UDisc-style round rating | Requires global population data we don't have. We show score-to-par, averages, bests, and a rolling "form" number instead. |

## 3. Architecture

```
Browser (React SPA, PWA)
  ├─ routes/       screens
  ├─ components/   UI pieces
  ├─ db/           Dexie schema + repositories
  ├─ domain/       pure logic: scoring, stats, osm parser, geo
  ├─ services/     overpass client, geolocation hook, nominatim
  └─ map/          MapLibre wrapper, course layers
Cloudflare Worker (Hono)
  └─ POST /api/overpass  → tries endpoint list, caches 1h in Cache API
Static assets served by Workers, SPA fallback
```

Data flows one way: services fetch → domain parses → db stores → `useLiveQuery` hooks read → components render. Domain modules never import React or Dexie.

## 4. Data model (Dexie `medisc`, version 1)

All rows: `id: string` (crypto.randomUUID), `createdAt`, `updatedAt` (epoch ms), optional `deletedAt`.

- **Player** `{ id, name, initials?, color, isMe: boolean, lastPlayedAt? }`
- **Course** `{ id, source: 'osm' | 'custom', osmType?, osmId?, name, lat, lon, holeCount, par?, city?, tags?: Record<string,string>, fetchedHolesAt?, bounds? }`
- **Hole** `{ id, courseId, number, par, distanceM?, tee?: {lat,lon}, basket?: {lat,lon}, path?: [lat,lon][], name? }`
- **Round** `{ id, courseId, courseName (denormalised), startedAt, finishedAt?, playerIds: string[], holeNumbers: number[], startingHole, notes?, name?, weather? }`
- **HoleScore** `{ id, roundId, playerId, holeNumber, par, strokes, penalties, throws?: Zone[] }` with `Zone = 'fairway' | 'off_fairway' | 'c2' | 'c1' | 'parked' | 'ob' | 'basket'`
- **Setting** `{ key, value }` for units (m/ft), theme, satellite default, last location.
- **OverpassCache** `{ key, fetchedAt, json }` for nearby queries keyed by rounded lat/lon/radius.

Indexes: `holes: [courseId+number]`, `rounds: courseId, startedAt, finishedAt, *playerIds`, `holeScores: roundId, [roundId+playerId], [roundId+holeNumber], playerId`.

Strokes rule: `strokes` is the total including penalties. If `throws` exist, `strokes = throws.length + count(ob)` where an `ob` entry counts one throw plus one penalty and `basket` is the holing throw. The +/- buttons edit `strokes` directly and do not require throws.

## 5. Screens

Bottom tab bar (4 tabs, safe-area aware): **Home**, **Courses**, **Rounds**, **Stats**. A prominent **Play** button lives on Home and as a floating action button on Courses. Settings is reachable from the Home header.

1. **Onboarding** (first launch): ask for the player's name, create the `isMe` player, ask for location permission with a reason.
2. **Home**: greeting, live round card if one is unfinished (resume), Play button, quick stats strip (rounds, courses, best to-par, current streak), recent rounds list, nearby courses teaser.
3. **Courses**: geolocate, radius selector (10/25/50 km), list/map toggle, search box (filters loaded results; a "search a place" action geocodes via Nominatim then re-queries). Course card: name, distance, holes, par, fee/access chips, "Play" shortcut. Also "Create custom course".
4. **Course detail**: header, map (holes, tees, baskets, user dot), hole table (number, par, distance), personal stats on this course (rounds, best, average, per-hole average and best), Play button, Edit holes (manual editor: hole count, pars, distances, drop tee/basket pins by tapping the map).
5. **New round**: course (preselected or picker), players (me preselected, recent cardmates as chips, add guest by name), starting hole, holes to play (all or front/back 9), throw tracking on/off, Start.
6. **Live scorecard**: one hole per screen. Header: hole number, par, distance, prev/next, hole picker grid. Collapsible map panel showing this hole with live distance from the user to the basket. Player rows: name, big stroke number, minus and plus buttons, running total and to-par. Tapping a row opens the throw tracker sheet (zone chips per throw, undo, "In the basket"). Menu: edit par for this hole, add/remove player, finish round, delete round. Autosaves on every tap.
7. **Round summary**: score per player with to-par, winner highlight, hole-by-hole grid with UDisc-style score colouring, throw stats if tracked, buttons: share (Web Share API text), edit, delete.
8. **Rounds**: list grouped by month with course, date, score/to-par per player, tap to open summary. Filter by course.
9. **Stats**: range selector (last 5, last 20, this year, all). Sections: overview tiles (rounds, average to-par, best round, birdie rate, par-or-better rate, current weekly streak), form line chart (to-par per round over time), score distribution bar (ace/eagle/birdie/par/bogey/double/triple+), best rounds table, best shots (aces, best hole streak of birdies, most birdies in a round, most improved course), throw stats tiles when data exists (fairway hit %, C1 in reg, C2 in reg, parked %, scramble %, OB rate, C1 putting, C1X putting, C2 putting), per-course breakdown (rounds, best, average, hardest and easiest holes), head-to-head vs cardmates (wins/losses/ties).
10. **Settings**: name, units, theme (system/light/dark), satellite default, clear cache, export/import JSON backup.

## 6. Domain logic

- `scoring.ts`: relative-to-par, score labels (ace, eagle, birdie, par, bogey, double, triple+), round totals, strokes from throws.
- `stats.ts`: everything under the Stats screen, given rounds + holeScores + players. Pure functions. Throw stats definitions follow UDisc: fairway hit (par 3: first throw in C2 or better; par 4: fairway or C2; par 5: first two throws), C1/C2 in regulation, parked, scramble (par or better after being outside C2 with two throws left), C1 putting (throw from `c1`/`parked` zone into basket), C1X (from `c1` only), C2 putting, OB rate, birdie rate.
- `osm.ts`: Overpass JSON → `Course[]` (nearby) and `Hole[]` (course detail) handling relation, area, and node cases; parse hole count from messy tags; unit-aware length parsing.
- `geo.ts`: haversine metres, bearing, bbox, formatting for m/ft.

## 7. Services

- `overpass.ts`: builds queries, calls `/api/overpass`, falls back to direct public endpoints if the API is unreachable, caches in `OverpassCache`.
- `useGeolocation.ts`: coarse fix on gesture then high-accuracy watch while mounted, exposes position, accuracy, error, permission state.
- `nominatim.ts`: place search for the Courses screen.
- Worker `worker/index.ts`: Hono; `POST /api/overpass` with body `{ query }`; tries endpoints in order, 25 s timeout each, caches by query hash for 1 h; returns JSON with `X-Overpass-Source` header.

## 8. Visual design

Brand: not UDisc's orange. Palette built around a deep evergreen for surfaces, a warm "chains" amber accent for primary actions, and the standard score colours (birdie blues, bogey oranges, ace green). Light and dark themes via CSS tokens on `:root`, dark by default at night is not attempted; follow system with a manual override. Large tappable numbers on the scorecard (minimum 44 px targets), high contrast for sunlight. Typography: a geometric display face for numbers and headings paired with a legible UI sans. Cards with soft radius, minimal shadows, hairline dividers.

## 9. Error handling

- Geolocation denied: Courses screen shows an explanation and a place search box; Play still works with custom or searched courses.
- Overpass failing everywhere: show cached results if any, otherwise an error with retry. Never block starting a custom-course round.
- Course without holes in OSM: course detail shows "Holes not mapped yet" with the editor; New round asks for hole count and default par when the course has no holes.
- Map WebGL failure: catch and show a static placeholder with the hole list.
- IndexedDB unavailable (private mode): show a banner; app stays usable in memory for the session.

## 10. Testing

Vitest unit tests for `scoring.ts`, `stats.ts`, `osm.ts` (with fixture JSON from the real Overpass responses), `geo.ts`, and the overpass query builder. Browser walkthrough of the full flow before declaring done. `npm run build` and `wrangler deploy --dry-run` must pass.

## 11. Deployment

`npm run deploy` runs `vite build` then `wrangler deploy`. README documents: `npx wrangler login`, `npm run deploy`, and connecting the repo to Workers Builds for git deploys. Worker name `medisc`.
