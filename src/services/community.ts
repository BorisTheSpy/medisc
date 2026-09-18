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

export interface SharedCourse {
  name: string;
  holes: Hole[];
}

export async function fetchCommunityHoles(course: Course, signal?: AbortSignal): Promise<SharedCourse | null> {
  const res = await fetch(`/api/community/courses/${encodeURIComponent(courseKey(course))}`, { signal });
  if (!res.ok) return null;
  const json = (await res.json()) as { enabled: boolean; course?: CommunityCourseRow | null; holes?: CommunityHole[] };
  if (!json.enabled || !json.holes) return null;
  return { name: json.course?.name ?? course.name, holes: toHoles(course, json.holes) };
}

function toHoles(course: Course, holes: CommunityHole[]): Hole[] {
  return holes.map((h) => ({
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
const DIRTY_KEY = "community.dirty";

async function getDirty(): Promise<string[]> {
  const row = await db.settings.get(DIRTY_KEY).catch(() => undefined);
  return Array.isArray(row?.value) ? (row!.value as string[]) : [];
}

async function setDirty(ids: string[]): Promise<void> {
  await db.settings.put({ key: DIRTY_KEY, value: ids }).catch(() => {});
}

async function markDirty(courseId: string): Promise<void> {
  const ids = await getDirty();
  if (!ids.includes(courseId)) await setDirty([...ids, courseId]);
}

async function clearDirty(courseId: string): Promise<void> {
  await setDirty((await getDirty()).filter((id) => id !== courseId));
}

/** Push one course's layout now. Returns true when the server accepted it. */
export async function publishCourseNow(courseId: string): Promise<boolean> {
  const course = await db.courses.get(courseId);
  if (!course || course.tags?.__needsLocation) return false;
  const holes = (await db.holes.where("courseId").equals(courseId).toArray()).sort((a, b) => a.number - b.number);
  const body = {
    course: { name: course.name, lat: course.lat, lon: course.lon, holeCount: holes.length || course.holeCount, par: course.par ?? null, city: course.city ?? null, region: course.region ?? null, source: course.source },
    holes: holes.map((h) => ({ number: h.number, par: h.par, distanceM: h.distanceM ?? null, tee: h.tee ?? null, basket: h.basket ?? null, updatedAt: h.updatedAt })),
  };
  try {
    const res = await fetch(`/api/community/courses/${encodeURIComponent(courseKey(course))}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true });
    if (!res.ok) throw new Error(String(res.status));
    await clearDirty(courseId);
    return true;
  } catch {
    await markDirty(courseId);
    return false;
  }
}

/**
 * Push a course's holes to the shared database. Marks the course dirty first so a failed or
 * interrupted upload is retried on the next launch, reconnect or return to the foreground.
 */
export function publishCourse(courseId: string, delayMs = 400): void {
  void markDirty(courseId);
  const existing = pending.get(courseId);
  if (existing) window.clearTimeout(existing);
  pending.set(
    courseId,
    window.setTimeout(() => {
      pending.delete(courseId);
      void publishCourseNow(courseId);
    }, delayMs),
  );
}

/** Retry anything that never made it out, plus a one-time sweep of every locally mapped course. */
export async function flushPendingPublishes(): Promise<void> {
  const ids = new Set(await getDirty());
  const swept = await db.settings.get("community.swept").catch(() => undefined);
  if (!swept) {
    const mapped = await db.holes.filter((h) => !!(h.tee || h.basket)).toArray();
    for (const h of mapped) ids.add(h.courseId);
    const edited = await db.courses.filter((c) => !!c.tags?.__edited).toArray();
    for (const c of edited) ids.add(c.id);
    await db.settings.put({ key: "community.swept", value: Date.now() }).catch(() => {});
  }
  for (const id of ids) await publishCourseNow(id);
}

let flushHooksInstalled = false;
export function installPublishRetries(): void {
  if (flushHooksInstalled) return;
  flushHooksInstalled = true;
  const run = () => void flushPendingPublishes().catch(() => {});
  window.setTimeout(run, 1500);
  window.addEventListener("online", run);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") run();
  });
}

/** Courses other players have added or mapped, as nearby candidates. */
export async function fetchCommunityCourses(center: LatLon, radiusM: number, signal?: AbortSignal): Promise<NearbyCourse[]> {
  return communityRequest(`/api/community/courses?lat=${center.lat.toFixed(5)}&lon=${center.lon.toFixed(5)}&radius=${Math.round(radiusM)}`, signal);
}

/** Name search over everything players have named, so a renamed course is found by its real name. */
export async function searchCommunityCourses(q: string, center: LatLon | null, signal?: AbortSignal): Promise<NearbyCourse[]> {
  const params = new URLSearchParams({ q });
  if (center) {
    params.set("lat", center.lat.toFixed(5));
    params.set("lon", center.lon.toFixed(5));
  }
  return communityRequest(`/api/community/courses?${params.toString()}`, signal);
}

async function communityRequest(url: string, signal?: AbortSignal): Promise<NearbyCourse[]> {
  const res = await fetch(url, { signal });
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
