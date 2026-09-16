import type { Course, LatLon } from "@/domain/types";
import type { NearbyCourse } from "@/domain/osm";

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

/** US course directory via the Worker. Returns [] outside the US or when the Worker is unavailable. */
export async function fetchUsCourses(center: LatLon, radiusM: number, signal?: AbortSignal): Promise<NearbyCourse[]> {
  return request(`/api/courses/us?lat=${center.lat.toFixed(5)}&lon=${center.lon.toFixed(5)}&radius=${Math.round(radiusM)}`, signal);
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
