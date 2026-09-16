import type { Course, LatLon } from "@/domain/types";
import type { NearbyCourse } from "@/domain/osm";
import { db } from "@/db/db";
import { haversineM } from "@/domain/geo";

interface PlaceRow {
  id: string;
  name: string;
  lat: number;
  lon: number;
  address?: string;
  distanceM?: number;
}

const TTL = 24 * 3600_000;

function toCourse(r: PlaceRow, center: LatLon | null): NearbyCourse {
  const now = Date.now();
  const parts = (r.address ?? "").split(",").map((x) => x.trim());
  const city = parts.length >= 3 ? parts[parts.length - 3] : undefined;
  const region = parts.length >= 2 ? parts[parts.length - 2].replace(/\s*\d{5}(-\d{4})?$/, "") : undefined;
  const course: Course & { distanceM?: number } = {
    id: `gp-${r.id}`,
    source: "places",
    placeId: r.id,
    name: r.name,
    lat: r.lat,
    lon: r.lon,
    holeCount: 18,
    city,
    region,
    createdAt: now,
    updatedAt: now,
  };
  if (center) course.distanceM = r.distanceM ?? haversineM(center, r);
  return course;
}

/** Google Places results via the Worker. Returns [] when the key is not configured. */
export async function fetchPlacesCourses(center: LatLon, radiusM: number, signal?: AbortSignal): Promise<NearbyCourse[]> {
  const key = `places:${center.lat.toFixed(2)}:${center.lon.toFixed(2)}:${Math.round(radiusM / 5000)}`;
  const cached = await db.overpassCache.get(key).catch(() => undefined);
  if (cached && Date.now() - cached.fetchedAt < TTL) return (cached.json as PlaceRow[]).map((r) => toCourse(r, center));
  const res = await fetch(`/api/courses/places?lat=${center.lat.toFixed(5)}&lon=${center.lon.toFixed(5)}&radius=${Math.round(radiusM)}`, { signal });
  if (!res.ok) {
    if (cached) return (cached.json as PlaceRow[]).map((r) => toCourse(r, center));
    throw new Error(`Places responded ${res.status}`);
  }
  const json = (await res.json()) as { enabled: boolean; courses: PlaceRow[] };
  if (!json.enabled) return [];
  await db.overpassCache.put({ key, fetchedAt: Date.now(), json: json.courses }).catch(() => {});
  return json.courses.map((r) => toCourse(r, center));
}

export async function searchPlacesByName(q: string, center: LatLon | null, signal?: AbortSignal): Promise<NearbyCourse[]> {
  const params = new URLSearchParams({ q });
  if (center) {
    params.set("lat", center.lat.toFixed(5));
    params.set("lon", center.lon.toFixed(5));
    params.set("radius", "80000");
  }
  const res = await fetch(`/api/courses/places?${params.toString()}`, { signal });
  if (!res.ok) return [];
  const json = (await res.json()) as { enabled: boolean; courses: PlaceRow[] };
  if (!json.enabled) return [];
  return json.courses.map((r) => toCourse(r, center));
}
