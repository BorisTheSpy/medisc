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
  const url = `/api/courses/us?lat=${center.lat.toFixed(5)}&lon=${center.lon.toFixed(5)}&radius=${Math.round(radiusM)}`;
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
    course.distanceM = r.distanceM;
    return course;
  });
}
