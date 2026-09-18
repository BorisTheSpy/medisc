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
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, pin_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sync_players (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS sync_players_user ON sync_players (user_id, updated_at)`,
  `CREATE TABLE IF NOT EXISTS sync_rounds (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS sync_rounds_user ON sync_rounds (user_id, updated_at)`,
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
  const q = (c.req.query("q") ?? "").trim().toLowerCase().slice(0, 80);
  const hasOrigin = isNum(lat) && isNum(lon);
  if (q) {
    // Name search across everything players have named. Nearest first when an origin is known.
    const words = q.split(/\s+/).filter(Boolean);
    const where = words.map(() => "LOWER(name) LIKE ?").join(" AND ");
    const { results } = await db
      .prepare(`SELECT * FROM courses WHERE ${where} LIMIT 60`)
      .bind(...words.map((w) => `%${w}%`))
      .all<Record<string, unknown>>();
    const list = results.map(rowToCourse).map((x) => ({ ...x, distanceM: hasOrigin ? haversineM(lat, lon, x.lat, x.lon) : undefined }));
    if (hasOrigin) list.sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
    return c.json({ enabled: true, courses: list });
  }
  if (!hasOrigin) return c.json({ error: "lat and lon, or q, are required" }, 400);
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
           ON CONFLICT(course_key, number) DO UPDATE SET par = excluded.par,
             distance_m = COALESCE(excluded.distance_m, holes.distance_m),
             tee_lat = COALESCE(excluded.tee_lat, holes.tee_lat), tee_lon = COALESCE(excluded.tee_lon, holes.tee_lon),
             basket_lat = COALESCE(excluded.basket_lat, holes.basket_lat), basket_lon = COALESCE(excluded.basket_lon, holes.basket_lon),
             updated_at = excluded.updated_at
           WHERE excluded.updated_at >= holes.updated_at`,
        )
        .bind(key, Math.round(h.number), hPar, isNum(h.distanceM) ? Math.round(h.distanceM) : null, teeOk ? h.tee!.lat : null, teeOk ? h.tee!.lon : null, basketOk ? h.basket!.lat : null, basketOk ? h.basket!.lon : null, updatedAt),
    );
    statements.push(db.prepare("INSERT INTO hole_history (course_key, number, payload, updated_at) VALUES (?1, ?2, ?3, ?4)").bind(key, Math.round(h.number), JSON.stringify(h).slice(0, 2000), updatedAt));
  }
  if (holes.length > 0) statements.push(db.prepare("DELETE FROM holes WHERE course_key = ?1 AND number > ?2").bind(key, holes.length));
  await db.batch(statements);
  const { results } = await db.prepare("SELECT * FROM holes WHERE course_key = ? ORDER BY number").bind(key).all<Record<string, unknown>>();
  return c.json({ enabled: true, holes: results.map(rowToHole) });
});

/** Restore pins from history: for each hole, re-apply the most recent recorded tee and basket. */
app.post("/api/community/courses/:key/restore", async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ enabled: false }, 503);
  await ensureSchema(db);
  const key = c.req.param("key");
  if (!KEY_RE.test(key)) return c.json({ error: "bad key" }, 400);
  const { results } = await db.prepare("SELECT number, payload, updated_at FROM hole_history WHERE course_key = ? ORDER BY updated_at DESC").bind(key).all<{ number: number; payload: string; updated_at: number }>();
  const tee = new Map<number, { lat: number; lon: number }>();
  const basket = new Map<number, { lat: number; lon: number }>();
  for (const r of results) {
    let h: CommunityHole;
    try {
      h = JSON.parse(r.payload) as CommunityHole;
    } catch {
      continue;
    }
    if (h.tee && isNum(h.tee.lat) && isNum(h.tee.lon) && !tee.has(r.number)) tee.set(r.number, h.tee);
    if (h.basket && isNum(h.basket.lat) && isNum(h.basket.lon) && !basket.has(r.number)) basket.set(r.number, h.basket);
  }
  const now = Date.now();
  const numbers = new Set([...tee.keys(), ...basket.keys()]);
  const statements: D1PreparedStatement[] = [];
  for (const n of numbers) {
    const t = tee.get(n) ?? null;
    const b = basket.get(n) ?? null;
    const dist = t && b ? Math.round(haversineM(t.lat, t.lon, b.lat, b.lon)) : null;
    statements.push(
      db
        .prepare(
          `UPDATE holes SET tee_lat = COALESCE(?2, tee_lat), tee_lon = COALESCE(?3, tee_lon), basket_lat = COALESCE(?4, basket_lat), basket_lon = COALESCE(?5, basket_lon),
             distance_m = COALESCE(?6, distance_m), updated_at = ?7 WHERE course_key = ?1 AND number = ?8`,
        )
        .bind(key, t?.lat ?? null, t?.lon ?? null, b?.lat ?? null, b?.lon ?? null, dist, now, n),
    );
  }
  if (statements.length) await db.batch(statements);
  const holes = await db.prepare("SELECT * FROM holes WHERE course_key = ? ORDER BY number").bind(key).all<Record<string, unknown>>();
  return c.json({ enabled: true, restored: numbers.size, holes: holes.results.map(rowToHole) });
});

// ---------------------------------------------------------------------------------------------
// Accounts: deliberately simple. A username plus a 4-digit PIN keeps people's stats apart and lets
// them sign in on another phone. PINs are salted and hashed; sessions are random tokens.
// ---------------------------------------------------------------------------------------------

const USERNAME_RE = /^[a-z0-9_.-]{2,24}$/;
const PIN_RE = /^\d{4,8}$/;

async function pinHash(username: string, pin: string): Promise<string> {
  return sha256(`medisc:${username}:${pin}`);
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface UserRow {
  id: string;
  username: string;
  display_name: string;
}

async function currentUser(c: { req: { header(name: string): string | undefined }; env: Env }): Promise<UserRow | null> {
  const db = c.env.DB;
  if (!db) return null;
  const auth = c.req.header("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  await ensureSchema(db);
  const row = await db.prepare("SELECT u.id, u.username, u.display_name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?").bind(token).first<UserRow>();
  return row ?? null;
}

app.post("/api/auth/register", async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: "Accounts are not available" }, 503);
  await ensureSchema(db);
  const body = await c.req.json<{ username?: string; pin?: string; displayName?: string }>().catch(() => ({}) as { username?: string; pin?: string; displayName?: string });
  const username = String(body.username ?? "").trim().toLowerCase();
  const pin = String(body.pin ?? "").trim();
  const displayName = String(body.displayName ?? username).trim().slice(0, 40) || username;
  if (!USERNAME_RE.test(username)) return c.json({ error: "Username: 2 to 24 letters, numbers, dots, dashes or underscores." }, 400);
  if (!PIN_RE.test(pin)) return c.json({ error: "PIN must be 4 to 8 digits." }, 400);
  const exists = await db.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
  if (exists) return c.json({ error: "That username is taken." }, 409);
  const id = crypto.randomUUID();
  const token = randomToken();
  const now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO users (id, username, display_name, pin_hash, created_at) VALUES (?, ?, ?, ?, ?)").bind(id, username, displayName, await pinHash(username, pin), now),
    db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)").bind(token, id, now),
  ]);
  return c.json({ token, user: { id, username, displayName } });
});

app.post("/api/auth/login", async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: "Accounts are not available" }, 503);
  await ensureSchema(db);
  const body = await c.req.json<{ username?: string; pin?: string }>().catch(() => ({}) as { username?: string; pin?: string });
  const username = String(body.username ?? "").trim().toLowerCase();
  const pin = String(body.pin ?? "").trim();
  const row = await db.prepare("SELECT id, username, display_name, pin_hash FROM users WHERE username = ?").bind(username).first<UserRow & { pin_hash: string }>();
  if (!row || row.pin_hash !== (await pinHash(username, pin))) return c.json({ error: "Wrong username or PIN." }, 401);
  const token = randomToken();
  await db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)").bind(token, row.id, Date.now()).run();
  return c.json({ token, user: { id: row.id, username: row.username, displayName: row.display_name } });
});

app.get("/api/auth/me", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ user: null }, 401);
  return c.json({ user: { id: user.id, username: user.username, displayName: user.display_name } });
});

app.post("/api/auth/logout", async (c) => {
  const db = c.env.DB;
  const auth = c.req.header("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (db && token) await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------------------------
// Sync: each round (with its hole scores) and each player is one JSON document owned by a user.
// Last write wins by updated_at. Deletes are tombstones inside the document (deletedAt).
// ---------------------------------------------------------------------------------------------

interface SyncDoc {
  id: string;
  updatedAt: number;
  [k: string]: unknown;
}

app.post("/api/sync", async (c) => {
  const db = c.env.DB;
  const user = await currentUser(c);
  if (!db || !user) return c.json({ error: "Sign in to sync" }, 401);
  const body = await c.req.json<{ since?: number; players?: SyncDoc[]; rounds?: SyncDoc[] }>().catch(() => ({}) as { since?: number; players?: SyncDoc[]; rounds?: SyncDoc[] });
  const since = isNum(body.since) ? body.since : 0;
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];
  const upsert = (table: string, docs: SyncDoc[] | undefined) => {
    for (const d of (docs ?? []).slice(0, 500)) {
      if (!d || typeof d.id !== "string" || d.id.length > 120) continue;
      const updatedAt = isNum(d.updatedAt) ? Math.min(d.updatedAt, now) : now;
      const payload = JSON.stringify(d).slice(0, 200_000);
      statements.push(
        db
          .prepare(`INSERT INTO ${table} (id, user_id, payload, updated_at) VALUES (?1, ?2, ?3, ?4)
                    ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
                    WHERE ${table}.user_id = excluded.user_id AND excluded.updated_at >= ${table}.updated_at`)
          .bind(d.id, user.id, payload, updatedAt),
      );
    }
  };
  upsert("sync_players", body.players);
  upsert("sync_rounds", body.rounds);
  if (statements.length) await db.batch(statements);
  const players = await db.prepare("SELECT payload FROM sync_players WHERE user_id = ? AND updated_at > ? ORDER BY updated_at LIMIT 2000").bind(user.id, since).all<{ payload: string }>();
  const rounds = await db.prepare("SELECT payload FROM sync_rounds WHERE user_id = ? AND updated_at > ? ORDER BY updated_at LIMIT 2000").bind(user.id, since).all<{ payload: string }>();
  const parse = (rows: { payload: string }[]) => rows.map((r) => JSON.parse(r.payload) as SyncDoc);
  return c.json({ now, players: parse(players.results), rounds: parse(rounds.results) }, 200, { "Cache-Control": "no-store" });
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app;
