import type { Course, Hole, LatLon } from "./types";
import { MAIN_LAYOUT } from "./layouts";
import { haversineM } from "./geo";

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: LatLon;
  tags?: Record<string, string>;
  nodes?: number[];
  geometry?: LatLon[];
  members?: { type: string; ref: number; role: string; geometry?: LatLon[] }[];
}

export interface OverpassResponse {
  elements: OverpassElement[];
}

export type NearbyCourse = Course & { distanceM?: number };

const TYPE_RANK: Record<OverpassElement["type"], number> = { relation: 3, way: 2, node: 1 };
const DEDUPE_RADIUS_M = 1500;

export function parseHoleCount(tags: Record<string, string>): number | undefined {
  const direct = tags["disc_golf:course"] ?? tags["disc_golf:holes"] ?? tags["holes"];
  if (direct) {
    const m = direct.match(/\d+/);
    if (m) return Number(m[0]);
  }
  const desc = tags.description ?? tags.note;
  if (desc) {
    const m = desc.match(/(\d+)\s*(?:holes?|väylää|hål|baskets?|korit?)/i);
    if (m) return Number(m[1]);
  }
  if (tags.name) {
    const range = tags.name.match(/holes?\s*(\d+)\s*[-–]\s*(\d+)/i);
    if (range) return Number(range[2]) - Number(range[1]) + 1;
    const count = tags.name.match(/(\d+)\s*-?\s*holes?/i);
    if (count) return Number(count[1]);
  }
  return undefined;
}

export function parseLengthM(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const m = raw.trim().match(/^([\d.,]+)\s*([a-zA-Z']*)$/);
  if (!m) return undefined;
  const value = Number(m[1].replace(",", "."));
  if (!Number.isFinite(value)) return undefined;
  const unit = m[2].toLowerCase();
  if (unit === "ft" || unit === "feet" || unit === "'") return value * 0.3048;
  if (unit === "km") return value * 1000;
  if (unit === "mi") return value * 1609.344;
  return value;
}

function elementPosition(e: OverpassElement): LatLon | undefined {
  if (typeof e.lat === "number" && typeof e.lon === "number") return { lat: e.lat, lon: e.lon };
  if (e.center) return e.center;
  return undefined;
}

function normaliseName(name: string): string {
  return name.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function parseNearbyCourses(json: OverpassResponse, origin?: LatLon): NearbyCourse[] {
  const now = Date.now();
  const candidates: NearbyCourse[] = [];
  for (const e of json.elements ?? []) {
    const tags = e.tags ?? {};
    if (tags.leisure !== "disc_golf_course") continue;
    const pos = elementPosition(e);
    if (!pos) continue;
    const name = tags.name ?? tags["name:en"];
    if (!name || JUNK_NAME.test(name)) continue;
    const course: NearbyCourse = {
      id: `osm-${e.type}-${e.id}`,
      source: "osm",
      osmType: e.type,
      osmId: e.id,
      name,
      lat: pos.lat,
      lon: pos.lon,
      holeCount: parseHoleCount(tags) ?? 18,
      par: tags["disc_golf:par"] ? Number(tags["disc_golf:par"].match(/\d+/)?.[0]) || undefined : undefined,
      city: tags["addr:city"],
      fee: tags.fee,
      access: tags.access,
      website: tags.website,
      tags,
      createdAt: now,
      updatedAt: now,
    };
    if (origin) course.distanceM = haversineM(origin, pos);
    candidates.push(course);
  }

  // Dedupe: same normalised name within radius, keep highest-ranked element type.
  candidates.sort((a, b) => TYPE_RANK[b.osmType!] - TYPE_RANK[a.osmType!]);
  const kept: NearbyCourse[] = [];
  for (const c of candidates) {
    const key = normaliseName(c.name);
    const dup = kept.find((k) => {
      const kk = normaliseName(k.name);
      const nameMatch = kk === key || kk.startsWith(key) || key.startsWith(kk);
      return nameMatch && haversineM(k, c) < DEDUPE_RADIUS_M;
    });
    if (dup) {
      // Merge useful tags from the lower-ranked duplicate.
      dup.par ??= c.par;
      dup.city ??= c.city;
      dup.fee ??= c.fee;
      dup.access ??= c.access;
      dup.website ??= c.website;
      if (!c.tags?.["disc_golf:course"] && dup.tags?.["disc_golf:course"]) {
        // keep dup holeCount
      } else if (c.tags?.["disc_golf:course"] && !dup.tags?.["disc_golf:course"]) {
        dup.holeCount = c.holeCount;
      }
      continue;
    }
    kept.push(c);
  }
  kept.sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
  return kept;
}

/** Merge OSM courses (preferred: may carry hole geometry) with directory courses, deduping by name and proximity. */
export function mergeCourseLists(osm: NearbyCourse[], directory: NearbyCourse[]): NearbyCourse[] {
  const out = [...osm];
  // Sources each entry has absorbed during this merge. Kept per call: the same lists are merged again on
  // every progressive update, and state that outlived a call turned every re-merge into duplicates.
  const absorbed = new Map<NearbyCourse, Set<string>>();
  const sourcesOf = (c: NearbyCourse) => {
    let set = absorbed.get(c);
    if (!set) absorbed.set(c, (set = new Set([c.source])));
    return set;
  };
  for (const d of directory) {
    if (out.some((k) => k.id === d.id)) continue;
    const key = normaliseName(d.name);
    // Nearest eligible duplicate wins. A record never merges into one from its own source, or into one that
    // already absorbed its source: a park with two courses lists both in the directory, and both must survive.
    const dup = out
      .filter((k) => !sourcesOf(k).has(d.source))
      .map((k) => {
        const kk = normaliseName(k.name);
        const nameMatch = kk === key || kk.startsWith(key) || key.startsWith(kk) || sharesWords(kk, key);
        const dist = haversineM(k, d);
        // Two records with real, clearly different hole counts are two courses in one park (a 9 beside an 18).
        const realCounts = k.source !== "places" && d.source !== "places" && k.holeCount > 0 && d.holeCount > 0;
        const differentCourse = realCounts && Math.abs(k.holeCount - d.holeCount) > 2;
        return { k, dist, ok: !differentCourse && dist < (nameMatch ? 2500 : 120) };
      })
      .filter((x) => x.ok)
      .sort((a, b) => a.dist - b.dist)[0]?.k;
    if (dup) {
      sourcesOf(dup).add(d.source);
      dup.par ??= d.par;
      dup.city ??= d.city;
      dup.website ??= d.website;
      // A record with a real layout keeps its hole count; only fill one that is missing.
      if (!dup.holeCount && d.holeCount) dup.holeCount = d.holeCount;
      dup.difficulty ??= d.difficulty;
      dup.rating ??= d.rating;
      continue;
    }
    out.push(d);
  }
  out.sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
  return out;
}

/** Hole and tee features occasionally carry the course tag; their names are not courses. */
const JUNK_NAME = /^\s*(hole|tee|basket|target)\s*#?\d+\s*$|practice\s+basket/i;
const DISC_GOLF_NAME = /disc\s*golf|frisbee|dgc\b|\bdg\b/i;

/**
 * Google Places returns parks near any "disc golf" search. Keep a Places result only when its name says disc
 * golf, or when a course from another source anchors it: within 300 m, or within 1 km sharing a name word
 * (large parks pin their course far from the park entrance).
 */
export function validatePlaces(list: NearbyCourse[]): NearbyCourse[] {
  const anchors = list.filter((c) => c.source !== "places");
  return list.filter((c) => {
    if (c.source !== "places") return true;
    if (DISC_GOLF_NAME.test(c.name)) return true;
    const words = nameWords(c.name);
    return anchors.some((a) => {
      const d = haversineM(a, c);
      return d < 300 || (d < 1000 && nameWords(a.name).some((w) => words.includes(w)));
    });
  });
}

function nameWords(name: string): string[] {
  return normaliseName(name)
    .split(" ")
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** Drop anything a player has reported as not a disc golf course: same key, or same name within 250 m. */
export function dropHidden(list: NearbyCourse[], hidden: { key: string; name: string; lat: number; lon: number }[]): NearbyCourse[] {
  if (hidden.length === 0) return list;
  const keys = new Set(hidden.map((h) => h.key));
  return list.filter((c) => !keys.has(c.id) && !hidden.some((h) => normaliseName(h.name) === normaliseName(c.name) && haversineM(h, c) < 250));
}

const STOP = new Set(["disc", "golf", "course", "dgc", "park", "the", "at", "of", "and", "frisbeegolfrata", "frisbeegolf"]);
function sharesWords(a: string, b: string): boolean {
  const wa = a.split(" ").filter((w) => w.length > 2 && !STOP.has(w));
  const wb = new Set(b.split(" ").filter((w) => w.length > 2 && !STOP.has(w)));
  const common = wa.filter((w) => wb.has(w)).length;
  return common >= 2 || (common >= 1 && Math.min(wa.length, wb.size) === 1);
}

export function parseCourseHoles(json: OverpassResponse, courseId: string): Hole[] {
  const now = Date.now();
  const elements = json.elements ?? [];
  const nodesById = new Map<number, OverpassElement>();
  for (const e of elements) if (e.type === "node") nodesById.set(e.id, e);

  const holes: Hole[] = [];
  const holeWays = elements.filter((e) => e.type === "way" && e.tags?.disc_golf === "hole");
  for (const way of holeWays) {
    const tags = way.tags ?? {};
    const geometry = way.geometry ?? [];
    if (geometry.length < 2) continue;
    const number = Number(tags.ref?.match(/\d+/)?.[0] ?? tags.name?.match(/\d+/)?.[0]);
    if (!Number.isFinite(number)) continue;
    const par = Number(tags.par ?? tags["disc_golf:par"]) || 3;
    const tee = geometry[0];
    const basket = geometry[geometry.length - 1];
    const tagged = parseLengthM(tags.dist ?? tags["disc_golf:length"] ?? tags.length);
    let distanceM = tagged;
    if (distanceM === undefined) {
      distanceM = 0;
      for (let i = 1; i < geometry.length; i++) distanceM += haversineM(geometry[i - 1], geometry[i]);
      distanceM = Math.round(distanceM);
    }
    holes.push({
      id: `${courseId}-${number}`,
      courseId,
      layoutId: MAIN_LAYOUT,
      number,
      par,
      distanceM,
      tee,
      basket,
      path: geometry,
      name: tags.name,
      updatedAt: now,
    });
  }

  // Fallback: no hole ways, but tee/basket nodes with refs.
  if (holes.length === 0) {
    const tees = elements.filter((e) => e.type === "node" && e.tags?.disc_golf === "tee" && e.tags.ref);
    const baskets = elements.filter((e) => e.type === "node" && e.tags?.disc_golf === "basket" && e.tags.ref);
    const numbers = new Set<number>();
    for (const t of [...tees, ...baskets]) {
      const n = Number(t.tags!.ref!.match(/\d+/)?.[0]);
      if (Number.isFinite(n)) numbers.add(n);
    }
    for (const number of numbers) {
      const tee = tees.find((t) => Number(t.tags!.ref!.match(/\d+/)?.[0]) === number);
      const basket = baskets.find((b) => Number(b.tags!.ref!.match(/\d+/)?.[0]) === number);
      const teePos = tee ? elementPosition(tee) : undefined;
      const basketPos = basket ? elementPosition(basket) : undefined;
      holes.push({
        id: `${courseId}-${number}`,
        courseId,
        layoutId: MAIN_LAYOUT,
        number,
        par: Number(tee?.tags?.par ?? basket?.tags?.par) || 3,
        distanceM: teePos && basketPos ? Math.round(haversineM(teePos, basketPos)) : undefined,
        tee: teePos,
        basket: basketPos,
        updatedAt: now,
      });
    }
  }

  // Dedupe hole numbers (alternate layouts): keep the first occurrence.
  const seen = new Set<number>();
  const unique = holes.filter((h) => (seen.has(h.number) ? false : (seen.add(h.number), true)));
  unique.sort((a, b) => a.number - b.number);
  return unique;
}

export function nearbyQuery(center: LatLon, radiusM: number): string {
  const lat = Number(center.lat.toFixed(5));
  const lon = Number(center.lon.toFixed(5));
  return `[out:json][timeout:25];nwr["leisure"="disc_golf_course"](around:${Math.round(radiusM)},${lat},${lon});out tags center;`;
}

/** Courses whose name matches text, within a wide radius of a point. */
export function nameQuery(text: string, center: LatLon, radiusM = 200_000): string {
  const escaped = text.replace(/[\\"\[\]().*+?^$|{}]/g, (ch) => "\\" + ch);
  const lat = Number(center.lat.toFixed(5));
  const lon = Number(center.lon.toFixed(5));
  return `[out:json][timeout:25];nwr["leisure"="disc_golf_course"]["name"~"${escaped}",i](around:${Math.round(radiusM)},${lat},${lon});out tags center;`;
}

export function courseHolesQuery(course: Course, aroundM = 700): string {
  const tail = `out body geom;`;
  if (course.osmType === "relation" && course.osmId) {
    return `[out:json][timeout:25];rel(${course.osmId})->.course;way(r.course)["disc_golf"="hole"]->.holes;node(w.holes)["disc_golf"]->.pts;nwr["disc_golf"](around.course:200)->.near;(.holes; .pts; .near;);${tail}`;
  }
  if (course.osmType === "way" && course.osmId) {
    return `[out:json][timeout:25];way(${course.osmId});map_to_area->.c;(nwr["disc_golf"](area.c); nwr["disc_golf"](around:${aroundM},${course.lat},${course.lon}););${tail}`;
  }
  return `[out:json][timeout:25];nwr["disc_golf"~"^(tee|basket|hole)$"](around:${aroundM},${course.lat},${course.lon});${tail}`;
}
