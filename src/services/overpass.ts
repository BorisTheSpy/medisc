import { db } from "@/db/db";
import type { Course, LatLon } from "@/domain/types";
import { nearbyQuery, courseHolesQuery, parseNearbyCourses, parseCourseHoles, type OverpassResponse, type NearbyCourse } from "@/domain/osm";

const DIRECT_ENDPOINTS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
];

const NEARBY_TTL = 6 * 3600_000;

export class OverpassError extends Error {}

async function viaWorker(query: string, signal?: AbortSignal): Promise<OverpassResponse> {
  const res = await fetch("/api/overpass", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal,
  });
  if (!res.ok) throw new OverpassError(`Proxy responded ${res.status}`);
  const text = await res.text();
  try {
    return JSON.parse(text) as OverpassResponse;
  } catch {
    throw new OverpassError("Proxy returned a non-JSON response");
  }
}

async function viaDirect(query: string, signal?: AbortSignal): Promise<OverpassResponse> {
  let last: unknown;
  for (const endpoint of DIRECT_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
        signal,
      });
      if (res.ok) return (await res.json()) as OverpassResponse;
      last = new OverpassError(`${endpoint} responded ${res.status}`);
    } catch (err) {
      last = err;
      if (signal?.aborted) throw err;
    }
  }
  throw last instanceof Error ? last : new OverpassError("Course search is unavailable right now");
}

export async function runOverpass(query: string, signal?: AbortSignal): Promise<OverpassResponse> {
  try {
    return await viaWorker(query, signal);
  } catch (err) {
    if (signal?.aborted) throw err;
    return viaDirect(query, signal);
  }
}

function cacheKey(center: LatLon, radiusM: number): string {
  return `nearby:${center.lat.toFixed(2)}:${center.lon.toFixed(2)}:${radiusM}`;
}

export interface NearbyResult {
  courses: NearbyCourse[];
  fromCache: boolean;
  fetchedAt: number;
}

export async function fetchNearbyCourses(center: LatLon, radiusM: number, opts: { force?: boolean; signal?: AbortSignal } = {}): Promise<NearbyResult> {
  const key = cacheKey(center, radiusM);
  const cached = await db.overpassCache.get(key);
  if (cached && !opts.force && Date.now() - cached.fetchedAt < NEARBY_TTL) {
    return { courses: parseNearbyCourses(cached.json as OverpassResponse, center), fromCache: true, fetchedAt: cached.fetchedAt };
  }
  try {
    const json = await runOverpass(nearbyQuery(center, radiusM), opts.signal);
    await db.overpassCache.put({ key, fetchedAt: Date.now(), json });
    return { courses: parseNearbyCourses(json, center), fromCache: false, fetchedAt: Date.now() };
  } catch (err) {
    if (cached) return { courses: parseNearbyCourses(cached.json as OverpassResponse, center), fromCache: true, fetchedAt: cached.fetchedAt };
    throw err;
  }
}

export async function fetchCourseHoles(course: Course, signal?: AbortSignal) {
  const json = await runOverpass(courseHolesQuery(course), signal);
  return parseCourseHoles(json, course.id);
}
