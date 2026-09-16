import type { Course, LatLon } from "@/domain/types";
import type { NearbyCourse } from "@/domain/osm";
import { db } from "@/db/db";
import { haversineM } from "@/domain/geo";

interface DgaRow {
  id: string;
  name: string;
  lat: number;
  lon: number;
  locality?: string | null;
  region_code?: string | null;
  website?: string | null;
  holes?: number | null;
  access_model?: string | null;
  operational_status?: string | null;
  primary_layout?: { par_total?: number | null } | null;
  distanceM: number;
}

export const DGA_ATTRIBUTION = "Course data supplied by DiscGolfAPI.";

const DIRECTORY_RADIUS_M = 160_934; // always pull 100 miles so radius changes never wait on the network
const DIRECTORY_TTL = 24 * 3600_000;

function directoryKey(center: LatLon): string {
  // ~1 km grid so small GPS drift reuses the same cached sweep
  return `us:${center.lat.toFixed(2)}:${center.lon.toFixed(2)}`;
}

/**
 * US course directory via the Worker. Fetches a 100-mile sweep around the origin, caches it on the device
 * for a day, and filters to the requested radius locally. Falls back to the cached sweep if the network fails.
 */
export async function fetchUsCourses(center: LatLon, radiusM: number, signal?: AbortSignal): Promise<NearbyCourse[]> {
  const key = directoryKey(center);
  const cached = await db.overpassCache.get(key).catch(() => undefined);
  let sweep: NearbyCourse[] | null = null;
  if (cached && Date.now() - cached.fetchedAt < DIRECTORY_TTL) {
    sweep = cached.json as NearbyCourse[];
  } else {
    try {
      sweep = await request(`/api/courses/us?lat=${center.lat.toFixed(5)}&lon=${center.lon.toFixed(5)}&radius=${DIRECTORY_RADIUS_M}`, signal);
      await db.overpassCache.put({ key, fetchedAt: Date.now(), json: sweep }).catch(() => {});
    } catch (err) {
      if (cached) sweep = cached.json as NearbyCourse[];
      else throw err;
    }
  }
  return sweep
    .map((c) => ({ ...c, distanceM: c.distanceM ?? haversineM(center, c) }))
    .filter((c) => (c.distanceM ?? Infinity) <= radiusM)
    .sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
}

/** Name search across the whole US directory, nearest first when an origin is known. */
export async function searchUsCoursesByName(q: string, center: LatLon | null, signal?: AbortSignal): Promise<NearbyCourse[]> {
  const params = new URLSearchParams({ q });
  if (center) {
    params.set("lat", center.lat.toFixed(5));
    params.set("lon", center.lon.toFixed(5));
  }
  return request(`/api/courses/us?${params.toString()}`, signal);
}

async function request(url: string, signal?: AbortSignal): Promise<NearbyCourse[]> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`US course directory responded ${res.status}`);
  const json = (await res.json()) as { courses: DgaRow[] };
  const now = Date.now();
  return json.courses.map((r) => {
    const course: Course & { distanceM?: number } = {
      id: `dga-${r.id}`,
      source: "dga",
      dgaId: r.id,
      name: r.name,
      lat: r.lat,
      lon: r.lon,
      holeCount: r.holes ?? 18,
      par: r.primary_layout?.par_total ?? undefined,
      city: r.locality ?? undefined,
      region: r.region_code ?? undefined,
      website: r.website ?? undefined,
      access: r.access_model === "private" ? "private" : undefined,
      createdAt: now,
      updatedAt: now,
    };
    if (Number.isFinite(r.distanceM)) course.distanceM = r.distanceM;
    return course;
  });
}
