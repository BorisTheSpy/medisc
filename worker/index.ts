import { Hono } from "hono";

type Env = { ASSETS: Fetcher };

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

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app;
