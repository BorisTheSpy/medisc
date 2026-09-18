import { db } from "./db";
import { createPlayer, upsertCourse, uuid } from "./repo";
import { parseUdiscCsv, type UdiscExport, type UdiscLayout } from "@/domain/udisc";
import { searchCoursesByName } from "@/services/overpass";
import { publishCourse } from "@/services/community";
import type { Course, Hole, HoleScore, LatLon, Player, Round } from "@/domain/types";
import type { NearbyCourse } from "@/domain/osm";

export interface ImportSummary {
  rounds: number;
  skipped: number;
  courses: number;
  coursesNeedingLocation: string[];
  players: number;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const MAIN_LAYOUT = /^(main|default|standard|regular|normal|long|short)?\s*(layout|tees?)?$|^\d+\s*holes?$/i;

async function hashId(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sameCourse(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  return x === y || x.startsWith(y) || y.startsWith(x);
}

/** Find or create the course for a UDisc layout, then make its holes match the layout's pars. */
async function resolveCourse(layout: UdiscLayout, isExtraLayout: boolean, origin: LatLon | null, summary: ImportSummary): Promise<Course> {
  const displayName = isExtraLayout ? `${layout.courseName} (${layout.layoutName})` : layout.courseName;
  const existing = (await db.courses.toArray()).find((c) => !c.deletedAt && sameCourse(c.name, displayName));
  let course: Course | undefined = existing;

  if (!course) {
    // Try the live sources for a location before falling back to a placeholder.
    let found: NearbyCourse | undefined;
    if (!isExtraLayout) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 8000);
        searchCoursesByName(layout.courseName, origin, (results) => {
          found = results.find((r) => sameCourse(r.name, layout.courseName)) ?? (results.length === 1 ? results[0] : undefined);
          clearTimeout(timer);
          resolve();
        }).catch(() => resolve());
      });
    }
    const now = Date.now();
    if (found) {
      course = await upsertCourse({ ...found, distanceM: undefined } as Course);
    } else {
      course = {
        id: uuid(),
        source: "custom",
        name: displayName,
        lat: origin?.lat ?? 0,
        lon: origin?.lon ?? 0,
        holeCount: layout.pars.length,
        par: layout.pars.reduce((a, b) => a + b, 0),
        tags: { __needsLocation: "1", __edited: "1" },
        createdAt: now,
        updatedAt: now,
        fetchedHolesAt: now,
      };
      await db.courses.add(course);
      summary.coursesNeedingLocation.push(displayName);
    }
    summary.courses += 1;
  }

  // Apply pars from UDisc, keeping any tee/basket positions already mapped.
  const holes = await db.holes.where("courseId").equals(course.id).toArray();
  const byNumber = new Map(holes.map((h) => [h.number, h]));
  const now = Date.now();
  const next: Hole[] = layout.pars.map((par, i) => {
    const n = i + 1;
    const h = byNumber.get(n);
    return h ? { ...h, par, updatedAt: now } : { id: `${course!.id}-${n}`, courseId: course!.id, number: n, par, updatedAt: now };
  });
  await db.transaction("rw", db.holes, db.courses, async () => {
    await db.holes.where("courseId").equals(course!.id).delete();
    await db.holes.bulkPut(next);
    await db.courses.update(course!.id, {
      holeCount: next.length,
      par: next.reduce((a, h) => a + h.par, 0),
      fetchedHolesAt: now,
      tags: { ...(course!.tags ?? {}), __edited: "1" },
      updatedAt: now,
    });
  });
  publishCourse(course.id, 0);
  return course;
}

async function resolvePlayer(name: string, me: Player | undefined, cache: Map<string, Player>): Promise<Player> {
  const key = norm(name);
  const hit = cache.get(key);
  if (hit) return hit;
  let player: Player | undefined;
  if (me && (norm(me.name) === key || norm(me.name).split(" ")[0] === key.split(" ")[0])) player = me;
  if (!player) player = (await db.players.toArray()).find((p) => !p.deletedAt && norm(p.name) === key);
  if (!player) player = await createPlayer(name);
  cache.set(key, player);
  return player;
}

export async function importUdiscCsv(text: string, origin: LatLon | null, onProgress?: (msg: string) => void): Promise<ImportSummary> {
  const data: UdiscExport = parseUdiscCsv(text);
  const summary: ImportSummary = { rounds: 0, skipped: 0, courses: 0, coursesNeedingLocation: [], players: 0 };
  const me = await db.players.filter((p) => p.isMe && !p.deletedAt).first();

  // Courses and layouts first. The first layout seen for a course keeps the course name.
  const courseByLayout = new Map<string, Course>();
  const seenCourses = new Set<string>();
  for (const layout of data.layouts) {
    const isExtra = seenCourses.has(norm(layout.courseName)) && !MAIN_LAYOUT.test(layout.layoutName);
    seenCourses.add(norm(layout.courseName));
    onProgress?.(`Setting up ${layout.courseName}…`);
    const course = await resolveCourse(layout, isExtra, origin, summary);
    courseByLayout.set(`${layout.courseName}|${layout.layoutName}`, course);
  }

  const playerCache = new Map<string, Player>();
  const playersBefore = await db.players.count();
  // The person who exported the file is on every card. If none of the names match me, map that name to me.
  if (me) {
    const counts = new Map<string, number>();
    for (const r of data.rounds) for (const p of r.players) counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const matchesMe = data.playerNames.some((n) => norm(n) === norm(me.name) || norm(n).split(" ")[0] === norm(me.name).split(" ")[0]);
    if (top && !matchesMe && top[1] === data.rounds.length) playerCache.set(norm(top[0]), me);
  }
  for (const r of data.rounds) {
    const course = courseByLayout.get(`${r.courseName}|${r.layoutName}`);
    if (!course) continue;
    const id = `udisc-${await hashId(`${r.courseName}|${r.layoutName}|${r.startedAt}`)}`;
    if (await db.rounds.get(id)) {
      summary.skipped += 1;
      continue;
    }
    const players: Player[] = [];
    for (const p of r.players) players.push(await resolvePlayer(p.name, me, playerCache));
    const now = Date.now();
    const round: Round = {
      id,
      courseId: course.id,
      courseName: course.name,
      startedAt: r.startedAt,
      finishedAt: r.endedAt ?? r.startedAt + 90 * 60_000,
      playerIds: players.map((p) => p.id),
      holeNumbers: r.pars.map((_, i) => i + 1),
      startingHole: 1,
      trackThrows: false,
      name: r.layoutName && !MAIN_LAYOUT.test(r.layoutName) ? r.layoutName : undefined,
      createdAt: now,
      updatedAt: now,
    };
    const scores: HoleScore[] = [];
    r.players.forEach((p, pi) => {
      p.scores.forEach((strokes, hi) => {
        scores.push({ id: `${id}-${players[pi].id}-${hi + 1}`, roundId: id, playerId: players[pi].id, holeNumber: hi + 1, par: r.pars[hi], strokes, penalties: 0, updatedAt: now });
      });
    });
    await db.transaction("rw", db.rounds, db.holeScores, db.players, async () => {
      await db.rounds.add(round);
      await db.holeScores.bulkAdd(scores);
      for (const p of players) await db.players.update(p.id, { lastPlayedAt: Math.max(p.lastPlayedAt ?? 0, r.startedAt) });
    });
    summary.rounds += 1;
  }
  summary.players = (await db.players.count()) - playersBefore;
  return summary;
}
