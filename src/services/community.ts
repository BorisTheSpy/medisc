import { db } from "@/db/db";
import type { Course, Hole, LatLon } from "@/domain/types";
import type { NearbyCourse } from "@/domain/osm";

interface CommunityHole {
  number: number;
  par: number;
  distanceM?: number | null;
  tee?: LatLon | null;
  basket?: LatLon | null;
  updatedAt: number;
}

interface CommunityCourseRow {
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
  distanceM?: number;
}

/** Shared course key. Ids from OSM, the directory and Google are already deterministic; custom ids are UUIDs. */
export function courseKey(course: Course): string {
  return course.id;
}

export async function fetchCommunityHoles(course: Course, signal?: AbortSignal): Promise<Hole[] | null> {
  const res = await fetch(`/api/community/courses/${encodeURIComponent(courseKey(course))}`, { signal });
  if (!res.ok) return null;
  const json = (await res.json()) as { enabled: boolean; holes?: CommunityHole[] };
  if (!json.enabled || !json.holes) return null;
  return json.holes.map((h) => ({
    id: `${course.id}-${h.number}`,
    courseId: course.id,
    number: h.number,
    par: h.par,
    distanceM: h.distanceM ?? undefined,
    tee: h.tee ?? undefined,
    basket: h.basket ?? undefined,
    path: h.tee && h.basket ? [h.tee, h.basket] : undefined,
    updatedAt: h.updatedAt,
  }));
}

/**
 * Merge shared holes into the local copy: for each hole take whichever side changed most recently,
 * but never let a hole without positions overwrite one that has them.
 */
export function mergeHoles(local: Hole[], shared: Hole[]): { merged: Hole[]; changed: boolean } {
  const byNumber = new Map(local.map((h) => [h.number, h]));
  let changed = false;
  for (const s of shared) {
    const l = byNumber.get(s.number);
    if (!l) {
      byNumber.set(s.number, s);
      changed = true;
      continue;
    }
    const localHasPins = !!(l.tee || l.basket);
    const sharedHasPins = !!(s.tee || s.basket);
    const sharedNewer = s.updatedAt > l.updatedAt;
    if ((sharedNewer && (sharedHasPins || !localHasPins)) || (!localHasPins && sharedHasPins)) {
      byNumber.set(s.number, { ...l, ...s, id: l.id });
      changed = true;
    }
  }
  return { merged: [...byNumber.values()].sort((a, b) => a.number - b.number), changed };
}

const pending = new Map<string, number>();

/** Push a course's holes to the shared database. Debounced per course so rapid edits send once. */
export function publishCourse(courseId: string, delayMs = 1500): void {
  const existing = pending.get(courseId);
  if (existing) window.clearTimeout(existing);
  pending.set(
    courseId,
    window.setTimeout(async () => {
      pending.delete(courseId);
      try {
        const course = await db.courses.get(courseId);
        if (!course || course.tags?.__needsLocation) return;
        const holes = (await db.holes.where("courseId").equals(courseId).toArray()).sort((a, b) => a.number - b.number);
        const body = {
          course: { name: course.name, lat: course.lat, lon: course.lon, holeCount: holes.length || course.holeCount, par: course.par ?? null, city: course.city ?? null, region: course.region ?? null, source: course.source },
          holes: holes.map((h) => ({ number: h.number, par: h.par, distanceM: h.distanceM ?? null, tee: h.tee ?? null, basket: h.basket ?? null, updatedAt: h.updatedAt })),
        };
        await fetch(`/api/community/courses/${encodeURIComponent(courseKey(course))}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } catch {
        /* offline: the next edit will retry */
      }
    }, delayMs),
  );
}

/** Courses other players have added or mapped, as nearby candidates. */
export async function fetchCommunityCourses(center: LatLon, radiusM: number, signal?: AbortSignal): Promise<NearbyCourse[]> {
  const res = await fetch(`/api/community/courses?lat=${center.lat.toFixed(5)}&lon=${center.lon.toFixed(5)}&radius=${Math.round(radiusM)}`, { signal });
  if (!res.ok) return [];
  const json = (await res.json()) as { enabled: boolean; courses: CommunityCourseRow[] };
  if (!json.enabled) return [];
  const now = Date.now();
  return json.courses.map((r) => ({
    id: r.key,
    source: "community",
    name: r.name,
    lat: r.lat,
    lon: r.lon,
    holeCount: r.holeCount,
    par: r.par ?? undefined,
    city: r.city ?? undefined,
    region: r.region ?? undefined,
    createdAt: now,
    updatedAt: now,
    distanceM: r.distanceM,
  }));
}
