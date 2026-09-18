import { Hono } from "hono";

type Env = { ASSETS: Fetcher; GOOGLE_PLACES_KEY?: string; DB?: D1Database };

const ENDPOINTS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const CACHE_TTL_SECONDS = 3600;

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function fetchOverpass(query: string): Promise<{ body: string; source: string }> {
  let lastError: unknown = null;
  for (const endpoint of ENDPOINTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 28_000);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "medisc/0.1 (disc golf scorecard app)",
          Accept: "application/json",
        },
        body: "data=" + encodeURIComponent(query),
        signal: controller.signal,
      });
      if (res.ok) {
        const body = await res.text();
        // Overpass returns 200 with an error remark for some failures. Guard against non-JSON.
        JSON.parse(body);
        return { body, source: endpoint };
      }
      lastError = new Error(`${endpoint} responded ${res.status}`);
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error("All Overpass endpoints failed");
}

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true, time: Date.now() }));

app.post("/api/overpass", async (c) => {
  let query: unknown;
  try {
    ({ query } = await c.req.json<{ query?: unknown }>());
  } catch {
    return c.json({ error: "Body must be JSON with a query string" }, 400);
  }
  if (typeof query !== "string" || query.length === 0 || query.length > 8000) {
    return c.json({ error: "query must be a non-empty string under 8000 chars" }, 400);
  }

  const cache = caches.default;
  const cacheKey = new Request(`https://medisc.cache/overpass/${await sha256(query)}`);
  const cached = await cache.match(cacheKey);
  if (cached) {
    const res = new Response(cached.body, cached);
    res.headers.set("X-Overpass-Source", "cache");
    return res;
  }

  try {
    const { body, source } = await fetchOverpass(query);
    const res = new Response(body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
        "X-Overpass-Source": source,
      },
    });
    c.executionCtx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Overpass unavailable" }, 502);
  }
});

// US course directory from DiscGolfAPI (free with attribution). Cached for a day, filtered by radius here
// so the phone never downloads the 4.5 MB national list.
const DGA_URL = "https://io.discgolfapi.com/v1/courses?country=US&limit=10000";
const DGA_TTL_SECONDS = 86_400;

interface DgaCourse {
  id: string;
  name: string;
  lat: number;
  lon: number;
  locality?: string | null;
  region_code?: string | null;
  website?: string | null;
  holes?: number | null;
  operational_status?: string | null;
  existence_status?: string | null;
  access_model?: string | null;
  primary_layout?: { par_total?: number | null; length_meters?: number | null } | null;
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

let memory: { at: number; list: DgaCourse[] } | null = null;

async function loadUsCourses(ctx: { waitUntil(p: Promise<unknown>): void }): Promise<DgaCourse[]> {
  if (memory && Date.now() - memory.at < DGA_TTL_SECONDS * 1000) return memory.list;
  const cache = caches.default;
  const key = new Request("https://medisc.cache/dga/us");
  const hit = await cache.match(key).catch(() => undefined);
  if (hit) {
    const list = (await hit.json()) as DgaCourse[];
    memory = { at: Date.now(), list };
    return list;
  }
  let res: Response;
  try {
    res = await fetch(DGA_URL, { headers: { Accept: "application/json", "User-Agent": "medisc/0.1" }, signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    if (memory) return memory.list; // stale is better than nothing
    throw err;
  }
  if (!res.ok) {
    if (memory) return memory.list;
    throw new Error(`DiscGolfAPI responded ${res.status}`);
  }
  const json = (await res.json()) as { courses: DgaCourse[] };
  const slim = json.courses
    .filter((c) => typeof c.lat === "number" && typeof c.lon === "number" && c.existence_status !== "closed" && c.existence_status !== "removed")
    .map((c) => ({
      id: c.id,
      name: c.name,
      lat: c.lat,
      lon: c.lon,
      locality: c.locality ?? null,
      region_code: c.region_code ?? null,
      website: c.website ?? null,
      holes: c.holes ?? null,
      operational_status: c.operational_status ?? null,
      access_model: c.access_model ?? null,
      primary_layout: c.primary_layout ? { par_total: c.primary_layout.par_total ?? null, length_meters: c.primary_layout.length_meters ?? null } : null,
    }));
  memory = { at: Date.now(), list: slim };
  ctx.waitUntil(cache.put(key, new Response(JSON.stringify(slim), { headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${DGA_TTL_SECONDS}` } })).catch(() => {}));
  return slim;
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

app.get("/api/courses/us", async (c) => {
  const lat = Number(c.req.query("lat"));
  const lon = Number(c.req.query("lon"));
  const radius = Math.min(Number(c.req.query("radius") ?? 25_000), 250_000);
  const q = normalise(c.req.query("q") ?? "");
  const hasOrigin = Number.isFinite(lat) && Number.isFinite(lon);
  if (!hasOrigin && !q) return c.json({ error: "lat and lon, or q, are required" }, 400);
  try {
    const all = await loadUsCourses(c.executionCtx);
    let near = all.map((x) => ({ ...x, distanceM: hasOrigin ? haversineM(lat, lon, x.lat, x.lon) : Number.NaN }));
    if (q) {
      const words = q.split(" ").filter(Boolean);
      near = near.filter((x) => {
        const hay = normalise(`${x.name} ${x.locality ?? ""} ${x.region_code ?? ""}`);
        return words.every((w) => hay.includes(w));
      });
      near.sort((a, b) => (Number.isNaN(a.distanceM) ? 0 : a.distanceM) - (Number.isNaN(b.distanceM) ? 0 : b.distanceM));
      near = near.slice(0, 40);
    } else {
      near = near
        .filter((x) => x.distanceM <= radius)
        .sort((a, b) => a.distanceM - b.distanceM)
        .slice(0, 500);
    }
    return c.json({ attribution: "Course data supplied by DiscGolfAPI.", courses: near }, 200, { "Cache-Control": "public, max-age=3600" });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Course directory unavailable" }, 502);
  }
});

// Google Places (New) as an optional third source. Enabled when GOOGLE_PLACES_KEY is set.
// Field mask keeps calls on the Pro SKU (5,000 free per month). Results are cached 30 days per cell,
// which is the maximum Google's terms allow for place data other than IDs.
const PLACES_TTL_SECONDS = 30 * 86_400;
const PLACES_FIELDS = "places.id,places.displayName,places.location,places.formattedAddress,places.types,nextPageToken";

interface PlaceRow {
  id: string;
  displayName?: { text?: string };
  location?: { latitude: number; longitude: number };
  formattedAddress?: string;
  types?: string[];
}

interface PlaceCourse {
  id: string;
  name: string;
  lat: number;
  lon: number;
  address?: string;
  distanceM?: number;
}

async function placesSearch(key: string, textQuery: string, center: { lat: number; lon: number } | null, radius: number, maxPages: number): Promise<PlaceCourse[]> {
  const out: PlaceCourse[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const body: Record<string, unknown> = { textQuery, maxResultCount: 20, languageCode: "en" };
    if (center) {
      body.locationBias = { circle: { center: { latitude: center.lat, longitude: center.lon }, radius: Math.min(radius, 50_000) } };
      body.rankPreference = "DISTANCE";
    }
    if (pageToken) body.pageToken = pageToken;
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": PLACES_FIELDS },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Google Places responded ${res.status}`);
    const json = (await res.json()) as { places?: PlaceRow[]; nextPageToken?: string };
    for (const p of json.places ?? []) {
      if (!p.location || !p.displayName?.text) continue;
      const name = p.displayName.text;
      // Text search can return shops and clubs; keep parks and anything that says disc golf, drop retail.
      const t = p.types ?? [];
      const isShop = /shop|store|retail|supply|supplies/i.test(name) || t.some((x) => /store|shop/.test(x));
      const looksLikeCourse = /disc\s*golf|frisbee|dgc/i.test(name) || t.includes("park") || t.includes("golf_course") || t.includes("sports_complex");
      if (isShop || !looksLikeCourse) continue;
      out.push({ id: p.id, name, lat: p.location.latitude, lon: p.location.longitude, address: p.formattedAddress });
    }
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  // Google lists a course and the park it sits in as two places a few hundred metres apart.
  // Keep the one that names disc golf; otherwise keep the first.
  const named = (x: PlaceCourse) => /disc\s*golf|frisbee|dgc/i.test(x.name);
  const kept: PlaceCourse[] = [];
  for (const x of out.sort((a, b) => Number(named(b)) - Number(named(a)))) {
    if (kept.some((k) => haversineM(k.lat, k.lon, x.lat, x.lon) < 600)) continue;
    kept.push(x);
  }
  return kept;
}

app.get("/api/courses/places", async (c) => {
  const key = c.env.GOOGLE_PLACES_KEY;
  if (!key) return c.json({ enabled: false, courses: [] });
  const lat = Number(c.req.query("lat"));
  const lon = Number(c.req.query("lon"));
  const radius = Math.min(Number(c.req.query("radius") ?? 40_000), 80_000);
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  const hasOrigin = Number.isFinite(lat) && Number.isFinite(lon);
  if (!hasOrigin && !q) return c.json({ error: "lat and lon, or q, are required" }, 400);

  // Cache by a coarse cell so nearby users share results and the free tier goes a long way.
  const cell = hasOrigin ? `${(Math.round(lat * 20) / 20).toFixed(2)},${(Math.round(lon * 20) / 20).toFixed(2)}` : "none";
  const cacheKey = new Request(`https://medisc.cache/places/v2/${encodeURIComponent(q.toLowerCase())}/${cell}/${Math.round(radius / 5000)}`);
  const cache = caches.default;
  const hit = await cache.match(cacheKey).catch(() => undefined);
  if (hit) {
    const res = new Response(hit.body, hit);
    res.headers.set("X-Places-Source", "cache");
    return res;
  }
  try {
    const center = hasOrigin ? { lat, lon } : null;
    const textQuery = q ? `${q} disc golf` : "disc golf course";
    let list = await placesSearch(key, textQuery, center, radius, q ? 1 : 3);
    if (center) {
      list = list.map((x) => ({ ...x, distanceM: haversineM(lat, lon, x.lat, x.lon) }));
      if (!q) list = list.filter((x) => (x.distanceM ?? 0) <= radius);
      list.sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
    }
    const res = new Response(JSON.stringify({ enabled: true, courses: list }), {
      headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${PLACES_TTL_SECONDS}` },
    });
    c.executionCtx.waitUntil(cache.put(cacheKey, res.clone()).catch(() => {}));
    return res;
  } catch (err) {
    return c.json({ enabled: true, error: err instanceof Error ? err.message : "Places unavailable", courses: [] }, 502);
  }
});

// ---------------------------------------------------------------------------------------------
// Community layouts: shared tee/basket positions and pars, stored in D1. No accounts: it works like
// a wiki. Last write wins per hole and every change is kept in hole_history so mistakes can be undone.
// ---------------------------------------------------------------------------------------------

interface CommunityHole {
  number: number;
  par: number;
  distanceM?: number | null;
  tee?: { lat: number; lon: number } | null;
  basket?: { lat: number; lon: number } | null;
  updatedAt: number;
}

interface CommunityCourse {
  key: string;
  name: string;
  lat: number;
  lon: number;
  holeCount: number;
  par?: number | null;
  city?: string | null;
  region?: string | null;
  source: string;
  updatedAt: number;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS courses (key TEXT PRIMARY KEY, name TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL, hole_count INTEGER NOT NULL, par INTEGER, city TEXT, region TEXT, source TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS courses_lat_lon ON courses (lat, lon)`,
  `CREATE TABLE IF NOT EXISTS holes (course_key TEXT NOT NULL, number INTEGER NOT NULL, par INTEGER NOT NULL, distance_m INTEGER, tee_lat REAL, tee_lon REAL, basket_lat REAL, basket_lon REAL, updated_at INTEGER NOT NULL, PRIMARY KEY (course_key, number))`,
  `CREATE TABLE IF NOT EXISTS hole_history (id INTEGER PRIMARY KEY AUTOINCREMENT, course_key TEXT NOT NULL, number INTEGER NOT NULL, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS hole_history_course ON hole_history (course_key, updated_at)`,
];
let schemaReady: Promise<void> | null = null;
/** Idempotent, runs once per isolate. Lets the Worker deploy from git without a separate migration step. */
function ensureSchema(db: D1Database): Promise<void> {
  if (!schemaReady) {
    schemaReady = db.batch(SCHEMA.map((sql) => db.prepare(sql))).then(() => undefined).catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

const KEY_RE = /^[a-zA-Z0-9_:.-]{3,120}$/;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function rowToCourse(r: Record<string, unknown>): CommunityCourse {
  return {
    key: String(r.key),
    name: String(r.name),
    lat: Number(r.lat),
    lon: Number(r.lon),
    holeCount: Number(r.hole_count),
    par: r.par === null ? null : Number(r.par),
    city: (r.city as string | null) ?? null,
    region: (r.region as string | null) ?? null,
    source: String(r.source),
    updatedAt: Number(r.updated_at),
  };
}

function rowToHole(r: Record<string, unknown>): CommunityHole {
  return {
    number: Number(r.number),
    par: Number(r.par),
    distanceM: r.distance_m === null ? null : Number(r.distance_m),
    tee: r.tee_lat === null || r.tee_lon === null ? null : { lat: Number(r.tee_lat), lon: Number(r.tee_lon) },
    basket: r.basket_lat === null || r.basket_lon === null ? null : { lat: Number(r.basket_lat), lon: Number(r.basket_lon) },
    updatedAt: Number(r.updated_at),
  };
}

app.get("/api/community/courses", async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ enabled: false, courses: [] });
  await ensureSchema(db);
  const lat = Number(c.req.query("lat"));
  const lon = Number(c.req.query("lon"));
  const radius = Math.min(Number(c.req.query("radius") ?? 25_000), 250_000);
  if (!isNum(lat) || !isNum(lon)) return c.json({ error: "lat and lon are required" }, 400);
  const dLat = radius / 111_320;
  const dLon = radius / (111_320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  const { results } = await db
    .prepare("SELECT * FROM courses WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? LIMIT 400")
    .bind(lat - dLat, lat + dLat, lon - dLon, lon + dLon)
    .all<Record<string, unknown>>();
  const list = results
    .map(rowToCourse)
    .map((x) => ({ ...x, distanceM: haversineM(lat, lon, x.lat, x.lon) }))
    .filter((x) => x.distanceM <= radius)
    .sort((a, b) => a.distanceM - b.distanceM);
  return c.json({ enabled: true, courses: list });
});

app.get("/api/community/courses/:key", async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ enabled: false });
  await ensureSchema(db);
  const key = c.req.param("key");
  if (!KEY_RE.test(key)) return c.json({ error: "bad key" }, 400);
  const course = await db.prepare("SELECT * FROM courses WHERE key = ?").bind(key).first<Record<string, unknown>>();
  const { results } = await db.prepare("SELECT * FROM holes WHERE course_key = ? ORDER BY number").bind(key).all<Record<string, unknown>>();
  return c.json({ enabled: true, course: course ? rowToCourse(course) : null, holes: results.map(rowToHole) }, 200, { "Cache-Control": "no-store" });
});

app.put("/api/community/courses/:key", async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ enabled: false }, 503);
  await ensureSchema(db);
  const key = c.req.param("key");
  if (!KEY_RE.test(key)) return c.json({ error: "bad key" }, 400);
  let body: { course?: Partial<CommunityCourse>; holes?: CommunityHole[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Body must be JSON" }, 400);
  }
  const course = body.course;
  const holes = Array.isArray(body.holes) ? body.holes : [];
  if (!course || typeof course.name !== "string" || !course.name.trim() || !isNum(course.lat) || !isNum(course.lon)) {
    return c.json({ error: "course needs name, lat and lon" }, 400);
  }
  if (holes.length > 40) return c.json({ error: "too many holes" }, 400);
  const now = Date.now();
  const name = course.name.trim().slice(0, 120);
  const holeCount = Math.max(holes.length, isNum(course.holeCount) ? Math.round(course.holeCount) : 0, 1);
  const par = holes.length ? holes.reduce((a, h) => a + (isNum(h.par) ? h.par : 3), 0) : isNum(course.par) ? course.par : null;

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO courses (key, name, lat, lon, hole_count, par, city, region, source, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
         ON CONFLICT(key) DO UPDATE SET name = excluded.name, lat = excluded.lat, lon = excluded.lon, hole_count = excluded.hole_count,
           par = excluded.par, city = COALESCE(excluded.city, courses.city), region = COALESCE(excluded.region, courses.region), updated_at = excluded.updated_at`,
      )
      .bind(key, name, course.lat, course.lon, holeCount, par, course.city ?? null, course.region ?? null, String(course.source ?? "custom").slice(0, 20), now),
  ];
  for (const h of holes) {
    if (!isNum(h.number) || h.number < 1 || h.number > 40) continue;
    const hPar = isNum(h.par) ? Math.max(1, Math.min(9, Math.round(h.par))) : 3;
    const teeOk = h.tee && isNum(h.tee.lat) && isNum(h.tee.lon);
    const basketOk = h.basket && isNum(h.basket.lat) && isNum(h.basket.lon);
    const updatedAt = isNum(h.updatedAt) ? Math.min(h.updatedAt, now) : now;
    // Last write wins: only overwrite if this edit is newer than what is stored.
    statements.push(
      db
        .prepare(
          `INSERT INTO holes (course_key, number, par, distance_m, tee_lat, tee_lon, basket_lat, basket_lon, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
           ON CONFLICT(course_key, number) DO UPDATE SET par = excluded.par, distance_m = excluded.distance_m,
             tee_lat = excluded.tee_lat, tee_lon = excluded.tee_lon, basket_lat = excluded.basket_lat, basket_lon = excluded.basket_lon, updated_at = excluded.updated_at
           WHERE excluded.updated_at >= holes.updated_at`,
        )
        .bind(key, Math.round(h.number), hPar, isNum(h.distanceM) ? Math.round(h.distanceM) : null, teeOk ? h.tee!.lat : null, teeOk ? h.tee!.lon : null, basketOk ? h.basket!.lat : null, basketOk ? h.basket!.lon : null, updatedAt),
    );
    statements.push(db.prepare("INSERT INTO hole_history (course_key, number, payload, updated_at) VALUES (?1, ?2, ?3, ?4)").bind(key, Math.round(h.number), JSON.stringify(h).slice(0, 2000), updatedAt));
  }
  await db.batch(statements);
  const { results } = await db.prepare("SELECT * FROM holes WHERE course_key = ? ORDER BY number").bind(key).all<Record<string, unknown>>();
  return c.json({ enabled: true, holes: results.map(rowToHole) });
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app;
