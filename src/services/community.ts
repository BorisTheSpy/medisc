import { db } from "@/db/db";
import type { Course, Hole, LatLon, Layout } from "@/domain/types";
import type { NearbyCourse } from "@/domain/osm";
import { MAIN_LAYOUT, holeId } from "@/domain/layouts";

interface CommunityHole {
  number: number;
  par: number;
  distanceM?: number | null;
  tee?: LatLon | null;
  basket?: LatLon | null;
  updatedAt: number;
}

interface CommunityLayoutRow {
  layoutId: string;
  name: string;
  holeCount: number;
  par?: number | null;
  distanceM?: number | null;
  difficulty?: string | null;
  technicality?: string | null;
  lengthBin?: string | null;
  playCount?: number | null;
  updatedAt: number;
  holes?: CommunityHole[];
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
  difficulty?: string | null;
  rating?: number | null;
}

/** Shared course key. Ids from OSM, the directory and Google are already deterministic; custom ids are UUIDs. */
export function courseKey(course: Course): string {
  return course.id;
}

export interface SharedLayout extends Omit<Layout, "id" | "courseId"> {
  holes: Hole[];
}

export interface SharedCourse {
  name: string;
  /** Main layout holes. */
  holes: Hole[];
  /** Every layout the course has, main included when the server knows about it. */
  layouts: SharedLayout[];
  difficulty?: string;
  rating?: number;
}

export async function fetchCommunityHoles(course: Course, signal?: AbortSignal): Promise<SharedCourse | null> {
  const res = await fetch(`/api/community/courses/${encodeURIComponent(courseKey(course))}`, { signal });
  if (!res.ok) return null;
  const json = (await res.json()) as { enabled: boolean; course?: CommunityCourseRow | null; holes?: CommunityHole[]; layouts?: CommunityLayoutRow[] };
  if (!json.enabled || !json.holes) return null;
  const layouts: SharedLayout[] = (json.layouts ?? []).map((l) => ({
    layoutId: l.layoutId,
    name: l.name,
    holeCount: l.holeCount,
    par: l.par ?? undefined,
    distanceM: l.distanceM ?? undefined,
    difficulty: l.difficulty ?? undefined,
    technicality: l.technicality ?? undefined,
    lengthBin: l.lengthBin ?? undefined,
    playCount: l.playCount ?? undefined,
    updatedAt: l.updatedAt,
    holes: toHoles(course, l.layoutId === MAIN_LAYOUT ? json.holes! : (l.holes ?? []), l.layoutId),
  }));
  return { name: json.course?.name ?? course.name, holes: toHoles(course, json.holes, MAIN_LAYOUT), layouts, difficulty: json.course?.difficulty ?? undefined, rating: json.course?.rating ?? undefined };
}

function toHoles(course: Course, holes: CommunityHole[], layoutId: string): Hole[] {
  return holes.map((h) => ({
    id: holeId(course.id, layoutId, h.number),
    courseId: course.id,
    layoutId,
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
  let merged = [...byNumber.values()].sort((a, b) => a.number - b.number);
  // If the shared layout is newer than every local hole and shorter, the course was trimmed elsewhere.
  const newestLocal = Math.max(0, ...local.map((h) => h.updatedAt));
  const newestShared = Math.max(0, ...shared.map((h) => h.updatedAt));
  if (shared.length > 0 && shared.length < merged.length && newestShared > newestLocal) {
    merged = merged.filter((h) => h.number <= shared.length);
    changed = true;
  }
  return { merged, changed };
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
  const allHoles = (await db.holes.where("courseId").equals(courseId).toArray()).sort((a, b) => a.number - b.number);
  const holes = allHoles.filter((h) => (h.layoutId || MAIN_LAYOUT) === MAIN_LAYOUT);
  // Only publish something a player actually contributed: a pin, an edited layout, a rename, or a course they created.
  const hasSubstance = course.source === "custom" || !!course.tags?.__edited || !!course.tags?.__renamed || allHoles.some((h) => h.tee || h.basket);
  if (!hasSubstance) {
    await clearDirty(courseId);
    return false;
  }
  const wire = (h: Hole) => ({ number: h.number, par: h.par, distanceM: h.distanceM ?? null, tee: h.tee ?? null, basket: h.basket ?? null, updatedAt: h.updatedAt });
  const layoutRows = await db.layouts.where("courseId").equals(courseId).toArray();
  const body = {
    course: { name: course.name, lat: course.lat, lon: course.lon, holeCount: holes.length || course.holeCount, par: course.par ?? null, city: course.city ?? null, region: course.region ?? null, source: course.tags?.origin ?? course.source, difficulty: course.difficulty ?? null, rating: course.rating ?? null },
    holes: holes.map(wire),
    layouts: layoutRows.map((l) => ({
      layoutId: l.layoutId,
      name: l.name,
      holeCount: l.holeCount,
      par: l.par ?? null,
      distanceM: l.distanceM ?? null,
      difficulty: l.difficulty ?? null,
      technicality: l.technicality ?? null,
      lengthBin: l.lengthBin ?? null,
      playCount: l.playCount ?? null,
      updatedAt: l.updatedAt,
      holes: l.layoutId === MAIN_LAYOUT ? [] : allHoles.filter((h) => h.layoutId === l.layoutId).map(wire),
    })),
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

export interface HiddenCourse extends LatLon {
  key: string;
  name: string;
}

export interface CommunityNearby {
  courses: NearbyCourse[];
  hidden: HiddenCourse[];
}

/** Courses other players have added or mapped, plus places players have reported as not disc golf. */
export async function fetchCommunityNearby(center: LatLon, radiusM: number, signal?: AbortSignal): Promise<CommunityNearby> {
  const res = await fetch(`/api/community/courses?lat=${center.lat.toFixed(5)}&lon=${center.lon.toFixed(5)}&radius=${Math.round(radiusM)}`, { signal });
  if (!res.ok) return { courses: [], hidden: [] };
  const json = (await res.json()) as { enabled: boolean; courses: CommunityCourseRow[]; hidden?: HiddenCourse[] };
  if (!json.enabled) return { courses: [], hidden: [] };
  return { courses: rowsToCourses(json.courses), hidden: json.hidden ?? [] };
}

/**
 * A place reported as not a course may still sit in this device's saved courses from an earlier visit.
 * Tombstone those copies so "Courses you've opened" stops offering them. Rounds played there stay.
 */
export async function tombstoneHidden(hidden: HiddenCourse[]): Promise<void> {
  if (hidden.length === 0) return;
  const keys = new Set(hidden.map((h) => h.key));
  const now = Date.now();
  await db.courses
    .filter((c) => !c.deletedAt && c.source !== "custom" && keys.has(c.id))
    .modify({ deletedAt: now, updatedAt: now })
    .catch(() => undefined);
}

/** Report that a listed place has no disc golf course. Hides it for everyone. */
export async function hideCourse(course: Course, reason = "no disc golf here"): Promise<boolean> {
  try {
    const res = await fetch(`/api/community/courses/${encodeURIComponent(courseKey(course))}/hide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: course.name, lat: course.lat, lon: course.lon, reason }),
    });
    return res.ok;
  } catch {
    return false;
  }
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
  return rowsToCourses(json.courses);
}

function rowsToCourses(rows: CommunityCourseRow[]): NearbyCourse[] {
  const now = Date.now();
  return rows.map((r) => ({
    id: r.key,
    source: "community",
    // Where the shared record came from (udisc, dga, custom…), for attribution on the course page.
    tags: { origin: r.source },
    difficulty: r.difficulty ?? undefined,
    rating: r.rating ?? undefined,
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
