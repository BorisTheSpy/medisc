import { db } from "@/db/db";
import type { Course, LatLon } from "@/domain/types";
import { nearbyQuery, nameQuery, courseHolesQuery, parseNearbyCourses, parseCourseHoles, mergeCourseLists, type OverpassResponse, type NearbyCourse } from "@/domain/osm";
import { fetchUsCourses, searchUsCoursesByName } from "./discgolfapi";
import { fetchPlacesCourses, searchPlacesByName } from "./places";
import { fetchCommunityCourses, searchCommunityCourses } from "./community";

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

export async function fetchNearbyCourses(
  center: LatLon,
  radiusM: number,
  opts: { force?: boolean; signal?: AbortSignal; onUpdate?: (courses: NearbyCourse[]) => void } = {},
): Promise<NearbyResult> {
  const key = cacheKey(center, radiusM);
  const cached = await db.overpassCache.get(key);
  const cachedFresh = !!cached && !opts.force && Date.now() - cached.fetchedAt < NEARBY_TTL;

  // The US directory and Google Places answer quickly; deliver each as soon as it lands.
  let us: NearbyCourse[] = [];
  let places: NearbyCourse[] = [];
  let community: NearbyCourse[] = [];
  // Community entries carry shared layouts, so they win the dedupe against directory copies.
  const fastList = () => mergeCourseLists(community, mergeCourseLists(us, places));
  const emit = () => {
    if (opts.signal?.aborted) return;
    const osmNow = cachedFresh ? parseNearbyCourses(cached!.json as OverpassResponse, center) : [];
    const fast = fastList();
    if (fast.length > 0) opts.onUpdate?.(mergeCourseLists(osmNow, fast));
  };
  const communityPromise = fetchCommunityCourses(center, radiusM, opts.signal)
    .catch(() => [] as NearbyCourse[])
    .then((list) => {
      community = list;
      emit();
      return list;
    });
  const usPromise = fetchUsCourses(center, radiusM, opts.signal)
    .catch(() => [] as NearbyCourse[])
    .then((list) => {
      us = list;
      emit();
      return list;
    });
  const placesPromise = fetchPlacesCourses(center, radiusM, opts.signal)
    .catch(() => [] as NearbyCourse[])
    .then((list) => {
      places = list;
      emit();
      return list;
    });

  if (cachedFresh) {
    const osm = parseNearbyCourses(cached!.json as OverpassResponse, center);
    await Promise.all([usPromise, placesPromise, communityPromise]);
    return { courses: mergeCourseLists(osm, fastList()), fromCache: true, fetchedAt: cached!.fetchedAt };
  }

  let osm: NearbyCourse[] | null = null;
  let osmError: unknown = null;
  try {
    const json = await runOverpass(nearbyQuery(center, radiusM), opts.signal);
    await db.overpassCache.put({ key, fetchedAt: Date.now(), json });
    osm = parseNearbyCourses(json, center);
  } catch (err) {
    osmError = err;
    if (cached) osm = parseNearbyCourses(cached.json as OverpassResponse, center);
  }
  await Promise.all([usPromise, placesPromise, communityPromise]);
  const fast = fastList();
  if (osm === null && fast.length === 0) throw osmError instanceof Error ? osmError : new OverpassError("Course search is unavailable right now");
  return { courses: mergeCourseLists(osm ?? [], fast), fromCache: osm !== null && osmError !== null, fetchedAt: Date.now() };
}

/**
 * Search courses by name. The US directory answers fast and is delivered first; OpenStreetMap results
 * within 125 miles of the origin are merged in when they arrive via `onUpdate`.
 */
export async function searchCoursesByName(text: string, origin: LatLon | null, onUpdate: (courses: NearbyCourse[]) => void, signal?: AbortSignal): Promise<void> {
  const [community, dir, gp] = await Promise.all([
    searchCommunityCourses(text, origin, signal).catch(() => [] as NearbyCourse[]),
    searchUsCoursesByName(text, origin, signal).catch(() => [] as NearbyCourse[]),
    searchPlacesByName(text, origin, signal).catch(() => [] as NearbyCourse[]),
  ]);
  if (signal?.aborted) return;
  // Player-given names win over directory and Google names for the same course.
  const directory = mergeCourseLists(community, mergeCourseLists(dir, gp));
  onUpdate(directory);
  if (!origin) return;
  try {
    const json = await runOverpass(nameQuery(text, origin), signal);
    if (signal?.aborted) return;
    onUpdate(mergeCourseLists(parseNearbyCourses(json, origin), directory));
  } catch {
    /* keep directory results */
  }
}

export async function fetchCourseHoles(course: Course, signal?: AbortSignal) {
  const json = await runOverpass(courseHolesQuery(course), signal);
  return parseCourseHoles(json, course.id);
}
