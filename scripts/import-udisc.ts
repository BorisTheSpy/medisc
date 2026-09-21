/**
 * Import courses from UDisc into the shared community database.
 *
 * UDisc publishes each course page with its loader data streamed inline (React Router + turbo-stream). This reads
 * the course list around a point, takes the N closest, then reads each course page for every active layout: hole
 * pars, lengths, tee and basket positions, plus the course difficulty bins and rating. The most played layout
 * becomes the course's main layout; the others are stored as extra layouts players can pick when starting a round.
 *
 * Only run this with UDisc's permission. Requests are paced at one every 700 ms.
 *
 *   bun run scripts/import-udisc.ts --lat 35.0919 --lon -80.6523 --count 50 --base http://localhost:5173
 *   bun run scripts/import-udisc.ts --lat 35.0919 --lon -80.6523 --count 50 --base https://medisc.ivanvisotsky0.workers.dev
 *   add --dry to print what would be written without writing.
 */
import { decode } from "turbo-stream";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? "true" : all[i + 1]] : null))
    .filter((x): x is [string, string] => x !== null),
);
const LAT = Number(args.lat);
const LON = Number(args.lon);
const COUNT = Number(args.count ?? 50);
const BASE = (args.base ?? "http://localhost:5173").replace(/\/$/, "");
const DRY = args.dry === "true";
if (!Number.isFinite(LAT) || !Number.isFinite(LON)) {
  console.error("usage: --lat <lat> --lon <lon> [--count 50] [--base url] [--dry]");
  process.exit(1);
}

const UA = "Mozilla/5.0 (Macintosh) medisc-import";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Decode the loader data React Router streams into a page. */
async function loaderData(url: string): Promise<Record<string, any>> {
  const html = await fetch(url, { headers: { "User-Agent": UA } }).then((r) => r.text());
  const chunks: string[] = [];
  const re = /streamController\.enqueue\((".*?")\);/gs;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) chunks.push(JSON.parse(m[1]!));
  if (chunks.length === 0) throw new Error(`no loader data in ${url}`);
  const body = new TextEncoder().encode(chunks.join(""));
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(body);
      c.close();
    },
  });
  const result = await decode(stream);
  await result.done.catch(() => undefined);
  return (result.value as any).loaderData;
}

interface ListCourse {
  shortId: string;
  name: string;
  latitude: number;
  longitude: number;
  holeCount: number;
  difficultyBins?: string[];
  ratingAverage?: number | null;
  city?: string | null;
  state?: string | null;
  countryCode?: string;
  distanceFromSelectedPlace: { kilometers: number };
}

async function listNearby(): Promise<ListCourse[]> {
  const seen = new Map<string, ListCourse>();
  for (let page = 1; page <= 20; page++) {
    const data = await loaderData(`https://udisc.com/courses?latitude=${LAT}&longitude=${LON}&page=${page}`);
    const d = data["routes/courses/index"];
    for (const c of d.courseResults as ListCourse[]) seen.set(c.shortId, c);
    console.error(`list page ${page}: ${d.courseResults.length} courses`);
    if (!d.nextPageUrl || d.courseResults.length === 0) break;
    await sleep(700);
  }
  return [...seen.values()].filter((c) => c.countryCode === "US").sort((a, b) => a.distanceFromSelectedPlace.kilometers - b.distanceFromSelectedPlace.kilometers);
}

const slugOf = (c: ListCourse) =>
  `${c.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}-${c.shortId}`;

interface ImportHole {
  number: number;
  par: number;
  distanceM: number | null;
  tee: { lat: number; lon: number } | null;
  basket: { lat: number; lon: number } | null;
  updatedAt: number;
}

interface ImportLayout {
  layoutId: string;
  name: string;
  holeCount: number;
  par: number;
  distanceM: number | null;
  difficulty: string | null;
  technicality: string | null;
  lengthBin: string | null;
  playCount: number | null;
  updatedAt: number;
  holes: ImportHole[];
}

/** Every active layout with holes, most played first. The first one is the course's main layout. */
async function readLayouts(c: ListCourse): Promise<ImportLayout[]> {
  const data = await loaderData(`https://udisc.com/courses/${slugOf(c)}`);
  const d = data["routes/courses/$slug/index"];
  const layouts = ((d?.layouts ?? []) as any[]).filter((l) => l.status === "active" && Array.isArray(l.holes) && l.holes.length > 0);
  layouts.sort((a, b) => (b.playCount30 ?? 0) - (a.playCount30 ?? 0));
  const now = Date.now();
  return layouts.map((layout, i) => {
    const holes: ImportHole[] = (layout.holes as any[])
      .filter((h) => h.status === "active")
      .map((h, j) => {
        const tee = h.teePosition ?? h.teePad;
        const basket = h.targetPosition ?? h.basket;
        const dist = h.holeDistance?.meters ?? h.distance;
        return {
          number: j + 1,
          par: Number.isFinite(h.par) ? h.par : 3,
          distanceM: Number.isFinite(dist) ? Math.round(dist) : null,
          tee: tee && Number.isFinite(tee.latitude) ? { lat: tee.latitude, lon: tee.longitude } : null,
          basket: basket && Number.isFinite(basket.latitude) ? { lat: basket.latitude, lon: basket.longitude } : null,
          updatedAt: now,
        };
      });
    const total = layout.holeDistance?.meters;
    return {
      layoutId: i === 0 ? "main" : `udisc-l${layout.layoutId ?? layout._id}`,
      name: String(layout.name ?? (i === 0 ? "Main" : `Layout ${i + 1}`)).slice(0, 80),
      holeCount: holes.length,
      par: holes.reduce((a, h) => a + h.par, 0),
      distanceM: Number.isFinite(total) ? Math.round(total) : holes.some((h) => h.distanceM) ? holes.reduce((a, h) => a + (h.distanceM ?? 0), 0) : null,
      difficulty: layout.difficultyBin ?? null,
      technicality: layout.technicalityBin ?? null,
      lengthBin: layout.lengthBin ?? null,
      playCount: Number.isFinite(layout.playCount30) ? layout.playCount30 : null,
      updatedAt: now,
      holes,
    };
  });
}

interface CommunityRow {
  key: string;
  name: string;
  lat: number;
  lon: number;
  holeCount: number;
  source: string;
}

function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const STOP = new Set(["disc", "golf", "course", "dgc", "park", "the", "at", "of", "and"]);
const words = (n: string) =>
  n
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

/** Every word of the shorter name appears in the longer one (prefixes count: "elem" matches "elementary"). */
function sameName(a: string, b: string): boolean {
  const wa = words(a);
  const wb = words(b);
  if (wa.length === 0 || wb.length === 0) return false;
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  return short.every((w) => long.some((x) => x.startsWith(w) || w.startsWith(x)));
}

/** An existing community record for the same course: the same name within 1.5 km, or any record within 150 m. */
async function findExisting(c: ListCourse): Promise<CommunityRow | null> {
  const res = await fetch(`${BASE}/api/community/courses?lat=${c.latitude}&lon=${c.longitude}&radius=1500`);
  if (!res.ok) return null;
  const json = (await res.json()) as { enabled: boolean; courses: CommunityRow[] };
  if (!json.enabled) return null;
  const pos = { lat: c.latitude, lon: c.longitude };
  const candidates = json.courses.filter((r) => !r.key.startsWith("udisc-")).filter((r) => haversineM(pos, r) < 150 || sameName(r.name, c.name));
  candidates.sort((a, b) => haversineM(pos, a) - haversineM(pos, b));
  return candidates[0] ?? null;
}

/** What the shared database already holds for a course: main holes plus any extra layouts' holes, by layout id. */
async function existingHoles(key: string): Promise<Map<string, ImportHole[]>> {
  const out = new Map<string, ImportHole[]>();
  const res = await fetch(`${BASE}/api/community/courses/${encodeURIComponent(key)}`);
  if (!res.ok) return out;
  const json = (await res.json()) as { holes?: ImportHole[]; layouts?: { layoutId: string; holes?: ImportHole[] }[] };
  out.set("main", json.holes ?? []);
  for (const l of json.layouts ?? []) if (l.layoutId !== "main") out.set(l.layoutId, l.holes ?? []);
  return out;
}

/** Fill in what players have not mapped themselves; never move a pin someone placed on the ground. */
function keepPlayerPins(holes: ImportHole[], theirs: ImportHole[], keepPar: boolean): ImportHole[] {
  return holes.map((h) => {
    const t = theirs.find((x) => x.number === h.number);
    if (!t) return h;
    return { ...h, par: keepPar ? t.par : h.par, tee: t.tee ?? h.tee, basket: t.basket ?? h.basket, distanceM: t.distanceM ?? h.distanceM };
  });
}

async function main() {
  const list = await listNearby();
  const top = list.slice(0, COUNT);
  console.error(`${list.length} courses within UDisc's search radius; importing the ${top.length} closest`);
  let written = 0;
  let pinned = 0;
  let multi = 0;
  for (const c of top) {
    await sleep(700);
    const layouts = await readLayouts(c);
    const main = layouts[0];
    if (!main) {
      console.log(`       skip ${c.name}: no layout with holes`);
      continue;
    }
    const existing = await findExisting(c);
    let key = `udisc-${c.shortId}`;
    let name = c.name;
    let outHoles = main.holes;
    let source = "udisc";
    if (existing) {
      key = existing.key;
      name = existing.name;
      source = existing.source;
      const theirs = await existingHoles(existing.key);
      const keepPar = existing.source === "custom";
      outHoles = keepPlayerPins(main.holes, theirs.get("main") ?? [], keepPar);
      // A custom course keeps its own hole count.
      const theirMain = theirs.get("main") ?? [];
      if (keepPar && theirMain.length > 0 && theirMain.length < outHoles.length) outHoles = outHoles.slice(0, theirMain.length);
      for (const l of layouts.slice(1)) l.holes = keepPlayerPins(l.holes, theirs.get(l.layoutId) ?? [], false);
    }
    const body = {
      course: {
        name,
        lat: c.latitude,
        lon: c.longitude,
        holeCount: outHoles.length || c.holeCount,
        par: outHoles.length ? outHoles.reduce((a, h) => a + h.par, 0) : null,
        city: c.city ?? null,
        region: c.state ? stateAbbr(c.state) : null,
        source,
        difficulty: c.difficultyBins?.length ? c.difficultyBins.join(",") : null,
        rating: typeof c.ratingAverage === "number" ? c.ratingAverage : null,
      },
      holes: outHoles,
      layouts: layouts.map((l) => ({ ...l, holes: l.layoutId === "main" ? [] : l.holes, holeCount: l.layoutId === "main" ? outHoles.length : l.holeCount })),
    };
    const withPins = outHoles.filter((h) => h.tee || h.basket).length;
    const layoutNote = layouts.map((l) => `${l.name}${l.lengthBin ? ` (${l.lengthBin})` : ""}`).join(" | ");
    const line = `${c.distanceFromSelectedPlace.kilometers.toFixed(1).padStart(5)} km  ${name.padEnd(42)} ${String(outHoles.length).padStart(2)} holes  ${withPins.toString().padStart(2)} pinned  ${(body.course.difficulty ?? "").padEnd(28)} ${layoutNote}${existing ? `  → merges into ${existing.key}` : ""}`;
    console.log(line);
    if (DRY) continue;
    const res = await fetch(`${BASE}/api/community/courses/${encodeURIComponent(key)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) {
      console.error(`  failed: ${res.status} ${await res.text()}`);
      continue;
    }
    written++;
    if (withPins) pinned++;
    if (layouts.length > 1) multi++;
  }
  console.error(`${written} courses written, ${pinned} with pins, ${multi} with more than one layout${DRY ? " (dry run: nothing written)" : ""}`);
}

const STATES: Record<string, string> = { "North Carolina": "NC", "South Carolina": "SC", Virginia: "VA", Georgia: "GA", Tennessee: "TN" };
const stateAbbr = (s: string) => STATES[s] ?? s;

await main();
