# Disc golf course data, map tiles, and geolocation

Research notes verified 2026-09-16 against live Overpass, OSM wiki, taginfo, and tile endpoints.

## OpenStreetMap tagging

### Course object
Node, closed way, or multipolygon relation. Tag one object only.
- `leisure=disc_golf_course` (required, ~11.8k globally)
- `sport=disc_golf` (implied)
- `name`, `operator`, `website`, `opening_hours`, `fee=yes|no`, `access`, `addr:*`
- `disc_golf:course` = hole count, messy values (`9_hole`, `18_hole`, `9`, `18 hole`). Parse with `/\d+/`.
- `disc_golf:par` = total course par
- `disc_golf:length` = course length, unit varies

### Hole
Way from tee to basket, `disc_golf=hole` (~11k).
- `ref` = hole number (use ref, not name)
- `par` = per-hole par. `disc_golf:par` is legacy, read but do not write.
- `dist` or `disc_golf:length` = length, usually metres, sometimes "302 ft"
- Way direction is tee to basket. First node = tee, last node = basket.

### Tee
Node `disc_golf=tee`. Optional `surface`, `ref`, `name`, `tee=white;blue` (layout colours, semicolon separated).

### Basket
Node `disc_golf=basket`. Optional `ref`, `name`. No documented tag for alternate pin positions. Courses often have more baskets than holes.

### Other
`disc_golf=fairway` (area), `out_of_bounds`, `mando`, `drop_zone`, `island`, `dropbox`.

### Layouts / grouping
Relation `type=disc_golf_course` with members `role=hole` (~220 globally). In Helsinki the relation carries the course tags. Parser must handle:
1. Relation with hole members
2. Course area containing holes
3. Course node with nothing else mapped (the common US case)

### Coverage
Austin, 15 km: 7 courses, 1 basket node, zero hole ways. Helsinki, 15 km: 20 courses, several fully mapped. Hole-level data is dense in the Nordics and sparse in the US. The app needs a manual "set up holes yourself" fallback.

## Overpass queries (verified)

Q1, courses within N metres of a point:
```
[out:json][timeout:25];
nwr["leisure"="disc_golf_course"](around:15000,60.17,24.94);
out tags center;
```
Ways and relations get `center: {lat, lon}`; nodes have top-level `lat`/`lon`.

Sample elements:
```json
{"type":"node","id":285853805,"lat":60.1996806,"lon":24.8701152,
 "tags":{"fee":"no","leisure":"disc_golf_course","name":"Munkkiniemen frisbeegolfrata","sport":"disc_golf"}}
{"type":"relation","id":19340787,"center":{"lat":60.2548746,"lon":24.9114022},
 "tags":{"disc_golf:course":"18","disc_golf:par":"54","leisure":"disc_golf_course","name":"Paloheinän frisbeegolfrata","type":"disc_golf_course"}}
```

Q2, holes for a relation course:
```
[out:json][timeout:25];
rel(19340787)->.course;
way(r.course)["disc_golf"="hole"]->.holes;
node(w.holes)["disc_golf"]->.pts;
(.course; .holes; .pts;);
out body geom;
```
Hole ways look like:
```json
{"type":"way","id":1308601052,"nodes":[12118304683,12118304684],
 "geometry":[{"lat":60.2530143,"lon":24.9128466},{"lat":60.253369,"lon":24.9120378}],
 "tags":{"disc_golf":"hole","par":"3","ref":"4"}}
```
Tees and baskets often have no `ref`. Match node id to `nodes[0]` / `nodes[last]` of the hole way.

Q3, spatial fallback around a course centre (node or area courses):
```
[out:json][timeout:25];
nwr["disc_golf"~"^(tee|basket|hole|mando|drop_zone|out_of_bounds|fairway)$"](around:600,60.2548746,60.2548746);
out body geom;
```

### Endpoints, CORS, rate limits
- `https://overpass-api.de/api/interpreter`: CORS `*`, answers OPTIONS. Returns 406 with a generic User-Agent (browser fetch is fine). Rate limit 2 slots per IP, 429 when exceeded, frequent 504 under load.
- Mirrors with CORS `*`: `https://z.overpass-api.de/api/interpreter`, `https://overpass.kumi.systems/api/interpreter`, `https://overpass.private.coffee/api/interpreter`, `https://maps.mail.ru/osm/tools/overpass/api/interpreter` (fastest and most reliable in testing).
- Recommendation: POST, `[timeout:25]`, retry across an endpoint list on 429/504, cache results in IndexedDB keyed by rounded lat/lon, and proxy through a Worker with cache before any real traffic.

## Other data sources

| Source | Access | Hole geometry | Licence |
|---|---|---|---|
| PDGA REST API | PDGA member login | No | Non-commercial, members only, signed licence |
| DiscGolfAPI `https://io.discgolfapi.com/v1/courses?country=US` | No key | No, course lat/lon, hole count | Free incl. commercial with attribution "Course data supplied by DiscGolfAPI." 6,861 courses. No radius param, filter client side. |
| DGCourseReview API | Key by application | Partial | Proprietary, possibly dormant |
| UDisc | No public API, ToS forbids scraping | | Do not use |
| Kaggle PDGA scrape | CSV | No | Unclear, treat as non-redistributable |

Only OSM (ODbL, attribute "© OpenStreetMap contributors") provides tee and basket coordinates usable legally.

## Map tiles

Basemap: OpenFreeMap, no key, no limits, commercial OK. Styles: `https://tiles.openfreemap.org/styles/liberty`, `/bright`, `/positron`, `/dark`. ToS says may be discontinued, keep a fallback style.

Satellite:
- Esri World Imagery `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`: CORS `*`, no key, non-commercial with attribution. Commercial path is ArcGIS Location Platform with a key (2M tiles/month free).
- USGS NAIP (US only, public domain) `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{x}/{y}`: CORS `*`, no key.
- Stadia Alidade Satellite: key, free non-commercial 50k tiles/month.

Suggested stack: OpenFreeMap liberty default, raster satellite toggle, GeoJSON layers for holes/tees/baskets.

## Geodesy and geolocation

Haversine in metres:
```js
const R = 6371e3;
const p1 = lat1*Math.PI/180, p2 = lat2*Math.PI/180;
const dp = (lat2-lat1)*Math.PI/180, dl = (lon2-lon1)*Math.PI/180;
const a = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
const d = R * 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
```
Bearing: `atan2(sin dl * cos p2, cos p1 * sin p2 - sin p1 * cos p2 * cos dl)`, normalised to 0..360.

Geolocation pattern for mobile web:
1. On a user gesture call `getCurrentPosition` with `{enableHighAccuracy:false, maximumAge:60000, timeout:8000}` for a fast coarse fix.
2. While a play screen is open, `watchPosition` with `{enableHighAccuracy:true, maximumAge:0, timeout:15000}`.
3. Clear the watch on `visibilitychange` and unmount.
4. Read `coords.accuracy` and grey out fixes over ~20 m for hole distances.
5. `navigator.permissions.query({name:'geolocation'})` to avoid re-prompting.
Error codes: 1 denied, 2 unavailable, 3 timeout.
