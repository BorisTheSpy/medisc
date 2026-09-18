import { db } from "./db";
import type { Course, Hole, HoleScore, Player, Round, Zone } from "@/domain/types";
import { strokesFromThrows, penaltiesFromThrows } from "@/domain/scoring";

export const uuid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const PLAYER_COLORS = ["#E9A83A", "#3F75BA", "#C4553B", "#5E9C6B", "#8A5FBF", "#D07DA6", "#2F8F9D", "#B08A3C"];

export async function createPlayer(name: string, isMe = false): Promise<Player> {
  const count = await db.players.count();
  const now = Date.now();
  const player: Player = {
    id: uuid(),
    name: name.trim(),
    color: PLAYER_COLORS[count % PLAYER_COLORS.length],
    isMe,
    createdAt: now,
    updatedAt: now,
  };
  await db.players.add(player);
  return player;
}

export async function updatePlayer(id: string, patch: Partial<Player>): Promise<void> {
  await db.players.update(id, { ...patch, updatedAt: Date.now() });
}

export async function getMe(): Promise<Player | undefined> {
  return db.players.filter((p) => p.isMe && !p.deletedAt).first();
}

/** Insert or refresh a course. OSM courses are deduped by (osmType, osmId). */
export async function upsertCourse(course: Course): Promise<Course> {
  if (course.source === "osm" && course.osmType && course.osmId) {
    const existing = await db.courses.where("[osmType+osmId]").equals([course.osmType, course.osmId]).first();
    if (existing) {
      const merged: Course = { ...existing, ...course, id: existing.id, createdAt: existing.createdAt, fetchedHolesAt: existing.fetchedHolesAt, updatedAt: Date.now() };
      // Keep a user-edited hole count/par if they customised it.
      if (existing.tags?.__edited) {
        merged.holeCount = existing.holeCount;
        merged.par = existing.par;
        merged.tags = existing.tags;
      }
      await db.courses.put(merged);
      return merged;
    }
  }
  await db.courses.put(course);
  return course;
}

export async function createCustomCourse(input: { name: string; lat: number; lon: number; holeCount: number; defaultPar: number; city?: string }): Promise<Course> {
  const now = Date.now();
  const course: Course = {
    id: uuid(),
    source: "custom",
    name: input.name.trim(),
    lat: input.lat,
    lon: input.lon,
    holeCount: input.holeCount,
    par: input.holeCount * input.defaultPar,
    city: input.city,
    createdAt: now,
    updatedAt: now,
    fetchedHolesAt: now,
  };
  await db.courses.add(course);
  const holes: Hole[] = Array.from({ length: input.holeCount }, (_, i) => ({
    id: `${course.id}-${i + 1}`,
    courseId: course.id,
    number: i + 1,
    par: input.defaultPar,
    updatedAt: now,
  }));
  await db.holes.bulkPut(holes);
  return course;
}

export async function saveHoles(courseId: string, holes: Hole[], markFetched = true): Promise<void> {
  await db.transaction("rw", db.holes, db.courses, async () => {
    await db.holes.where("courseId").equals(courseId).delete();
    await db.holes.bulkPut(holes.map((h) => ({ ...h, courseId })));
    const par = holes.reduce((a, h) => a + h.par, 0);
    const patch: Partial<Course> = { updatedAt: Date.now() };
    if (holes.length > 0) {
      patch.holeCount = holes.length;
      patch.par = par;
    }
    if (markFetched) patch.fetchedHolesAt = Date.now();
    await db.courses.update(courseId, patch);
  });
}

export async function updateHole(hole: Hole): Promise<void> {
  await db.transaction("rw", db.holes, db.courses, async () => {
    await db.holes.put({ ...hole, updatedAt: Date.now() });
    const holes = await db.holes.where("courseId").equals(hole.courseId).toArray();
    const course = await db.courses.get(hole.courseId);
    await db.courses.update(hole.courseId, {
      par: holes.reduce((a, h) => a + h.par, 0),
      holeCount: holes.length,
      tags: { ...(course?.tags ?? {}), __edited: "1" },
      updatedAt: Date.now(),
    });
  });
}

/**
 * Remove one hole from a course. Later holes shift down so numbering stays contiguous. Rounds still in
 * progress on this course are adjusted the same way; finished rounds keep their history untouched.
 */
export async function removeHole(courseId: string, number: number): Promise<void> {
  await db.transaction("rw", db.holes, db.courses, db.rounds, db.holeScores, async () => {
    const now = Date.now();
    const holes = (await db.holes.where("courseId").equals(courseId).toArray()).sort((a, b) => a.number - b.number);
    if (!holes.some((h) => h.number === number) || holes.length <= 1) return;
    await db.holes.where("courseId").equals(courseId).delete();
    const next: Hole[] = holes
      .filter((h) => h.number !== number)
      .map((h) => (h.number > number ? { ...h, number: h.number - 1, id: `${courseId}-${h.number - 1}`, updatedAt: now } : h));
    await db.holes.bulkPut(next);
    const course = await db.courses.get(courseId);
    await db.courses.update(courseId, { holeCount: next.length, par: next.reduce((a, h) => a + h.par, 0), tags: { ...(course?.tags ?? {}), __edited: "1" }, updatedAt: now });

    const live = (await db.rounds.where("courseId").equals(courseId).toArray()).filter((r) => !r.finishedAt && !r.deletedAt);
    for (const r of live) {
      const scores = await db.holeScores.where("roundId").equals(r.id).toArray();
      await db.holeScores.where("roundId").equals(r.id).delete();
      const kept = scores
        .filter((sc) => sc.holeNumber !== number)
        .map((sc) => (sc.holeNumber > number ? { ...sc, holeNumber: sc.holeNumber - 1, id: `${r.id}-${sc.playerId}-${sc.holeNumber - 1}`, updatedAt: now } : sc));
      await db.holeScores.bulkPut(kept);
      const holeNumbers = r.holeNumbers.filter((n) => n !== number).map((n) => (n > number ? n - 1 : n));
      const startingHole = r.startingHole > number ? r.startingHole - 1 : Math.min(r.startingHole, holeNumbers[holeNumbers.length - 1] ?? 1);
      await db.rounds.update(r.id, { holeNumbers, startingHole, updatedAt: now });
    }
  });
}

/** Trim or extend a course to exactly `count` holes. Extra holes come off the end; new ones are par 3. */
export async function setHoleCount(courseId: string, count: number): Promise<void> {
  const target = Math.max(1, Math.min(36, Math.round(count)));
  const holes = (await db.holes.where("courseId").equals(courseId).toArray()).sort((a, b) => a.number - b.number);
  for (let n = holes.length; n > target; n--) await removeHole(courseId, n);
  if (holes.length < target) {
    const now = Date.now();
    const extra: Hole[] = [];
    for (let n = holes.length + 1; n <= target; n++) extra.push({ id: `${courseId}-${n}`, courseId, number: n, par: 3, updatedAt: now });
    await db.holes.bulkPut(extra);
    const all = await db.holes.where("courseId").equals(courseId).toArray();
    const course = await db.courses.get(courseId);
    await db.courses.update(courseId, { holeCount: all.length, par: all.reduce((a, h) => a + h.par, 0), tags: { ...(course?.tags ?? {}), __edited: "1" }, updatedAt: now });
  }
}

export async function getHoles(courseId: string): Promise<Hole[]> {
  const holes = await db.holes.where("courseId").equals(courseId).toArray();
  return holes.sort((a, b) => a.number - b.number);
}

export interface NewRoundInput {
  course: Course;
  holes: Hole[];
  playerIds: string[];
  startingHole: number;
  holeNumbers: number[];
  trackThrows: boolean;
}

export async function createRound(input: NewRoundInput): Promise<Round> {
  const now = Date.now();
  const round: Round = {
    id: uuid(),
    courseId: input.course.id,
    courseName: input.course.name,
    startedAt: now,
    playerIds: input.playerIds,
    holeNumbers: input.holeNumbers,
    startingHole: input.startingHole,
    trackThrows: input.trackThrows,
    createdAt: now,
    updatedAt: now,
  };
  const parByHole = new Map(input.holes.map((h) => [h.number, h.par]));
  const scores: HoleScore[] = [];
  for (const playerId of input.playerIds) {
    for (const holeNumber of input.holeNumbers) {
      scores.push({
        id: `${round.id}-${playerId}-${holeNumber}`,
        roundId: round.id,
        playerId,
        holeNumber,
        par: parByHole.get(holeNumber) ?? 3,
        strokes: 0,
        penalties: 0,
        updatedAt: now,
      });
    }
  }
  await db.transaction("rw", db.rounds, db.holeScores, db.players, async () => {
    await db.rounds.add(round);
    await db.holeScores.bulkAdd(scores);
    for (const playerId of input.playerIds) await db.players.update(playerId, { lastPlayedAt: now });
  });
  return round;
}

export async function setStrokes(scoreId: string, strokes: number): Promise<void> {
  const s = await db.holeScores.get(scoreId);
  if (!s) return;
  const next = Math.max(0, Math.min(30, strokes));
  // Manual edits drop throw tracking for that hole to keep strokes and throws consistent.
  await db.holeScores.update(scoreId, { strokes: next, throws: undefined, penalties: 0, updatedAt: Date.now() });
}

/** From an unscored hole, + sets par and − sets one under par. After that, each tap moves by one. */
export async function adjustStrokes(scoreId: string, delta: number): Promise<void> {
  const s = await db.holeScores.get(scoreId);
  if (!s) return;
  if (s.strokes === 0) {
    await setStrokes(scoreId, delta > 0 ? s.par : Math.max(1, s.par - 1));
    return;
  }
  await setStrokes(scoreId, Math.max(1, s.strokes + delta));
}

export async function setThrows(scoreId: string, throws: Zone[]): Promise<void> {
  await db.holeScores.update(scoreId, {
    throws,
    strokes: strokesFromThrows(throws),
    penalties: penaltiesFromThrows(throws),
    updatedAt: Date.now(),
  });
}

export async function setHolePar(roundId: string, holeNumber: number, par: number): Promise<void> {
  const scores = await db.holeScores.where("[roundId+holeNumber]").equals([roundId, holeNumber]).toArray();
  await db.holeScores.bulkPut(scores.map((s) => ({ ...s, par, updatedAt: Date.now() })));
}

export async function addPlayerToRound(round: Round, playerId: string): Promise<void> {
  if (round.playerIds.includes(playerId)) return;
  const existing = await db.holeScores.where("roundId").equals(round.id).toArray();
  const parByHole = new Map(existing.map((s) => [s.holeNumber, s.par]));
  const now = Date.now();
  const scores: HoleScore[] = round.holeNumbers.map((holeNumber) => ({
    id: `${round.id}-${playerId}-${holeNumber}`,
    roundId: round.id,
    playerId,
    holeNumber,
    par: parByHole.get(holeNumber) ?? 3,
    strokes: 0,
    penalties: 0,
    updatedAt: now,
  }));
  await db.transaction("rw", db.rounds, db.holeScores, db.players, async () => {
    await db.holeScores.bulkPut(scores);
    await db.rounds.update(round.id, { playerIds: [...round.playerIds, playerId], updatedAt: now });
    await db.players.update(playerId, { lastPlayedAt: now });
  });
}

export async function removePlayerFromRound(round: Round, playerId: string): Promise<void> {
  await db.transaction("rw", db.rounds, db.holeScores, async () => {
    await db.holeScores.where("[roundId+playerId]").equals([round.id, playerId]).delete();
    await db.rounds.update(round.id, { playerIds: round.playerIds.filter((p) => p !== playerId), updatedAt: Date.now() });
  });
}

export async function finishRound(roundId: string): Promise<void> {
  await db.rounds.update(roundId, { finishedAt: Date.now(), updatedAt: Date.now() });
}

export async function reopenRound(roundId: string): Promise<void> {
  await db.rounds.update(roundId, { finishedAt: undefined, updatedAt: Date.now() });
}

export async function updateRound(roundId: string, patch: Partial<Round>): Promise<void> {
  await db.rounds.update(roundId, { ...patch, updatedAt: Date.now() });
}

/** Soft delete so the deletion syncs to other devices; lists already hide tombstones. */
export async function deleteRound(roundId: string): Promise<void> {
  const now = Date.now();
  await db.rounds.update(roundId, { deletedAt: now, updatedAt: now });
}

/**
 * Fold one player into another: all their scores and card memberships move over, then the source
 * player is removed. Used for "This is me" and when an account id replaces the local me player.
 */
export async function mergePlayerInto(fromId: string, toId: string, ensure?: { name: string; color: string; isMe: boolean }): Promise<void> {
  if (fromId === toId) return;
  await db.transaction("rw", db.players, db.rounds, db.holeScores, async () => {
    const now = Date.now();
    const from = await db.players.get(fromId);
    const to = await db.players.get(toId);
    if (!to) {
      await db.players.put({ id: toId, name: ensure?.name ?? from?.name ?? "Me", color: ensure?.color ?? from?.color ?? "#E9A83A", isMe: ensure?.isMe ?? from?.isMe ?? false, lastPlayedAt: from?.lastPlayedAt, createdAt: now, updatedAt: now });
    } else if (ensure?.isMe && !to.isMe) {
      await db.players.update(toId, { isMe: true, updatedAt: now });
    }
    const rounds = await db.rounds.where("playerIds").equals(fromId).toArray();
    for (const r of rounds) {
      const alreadyThere = r.playerIds.includes(toId);
      const scores = await db.holeScores.where("[roundId+playerId]").equals([r.id, fromId]).toArray();
      for (const sc of scores) {
        if (alreadyThere) {
          // Both on the same card: keep the destination's scores, drop the duplicate's.
          await db.holeScores.delete(sc.id);
        } else {
          await db.holeScores.delete(sc.id);
          await db.holeScores.put({ ...sc, id: `${r.id}-${toId}-${sc.holeNumber}`, playerId: toId, updatedAt: now });
        }
      }
      const playerIds = alreadyThere ? r.playerIds.filter((id) => id !== fromId) : r.playerIds.map((id) => (id === fromId ? toId : id));
      await db.rounds.update(r.id, { playerIds, updatedAt: now });
    }
    // Tombstone rather than delete so the merge reaches other devices through sync.
    if (from) await db.players.put({ ...from, deletedAt: now, updatedAt: now });
  });
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const s = await db.settings.get(key);
  return (s?.value as T) ?? fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

export async function exportAll(): Promise<string> {
  const [players, courses, holes, rounds, holeScores, settings] = await Promise.all([
    db.players.toArray(),
    db.courses.toArray(),
    db.holes.toArray(),
    db.rounds.toArray(),
    db.holeScores.toArray(),
    db.settings.toArray(),
  ]);
  return JSON.stringify({ version: 1, exportedAt: Date.now(), players, courses, holes, rounds, holeScores, settings }, null, 2);
}

export async function importAll(json: string): Promise<{ rounds: number }> {
  const data = JSON.parse(json) as { players: Player[]; courses: Course[]; holes: Hole[]; rounds: Round[]; holeScores: HoleScore[]; settings?: { key: string; value: unknown }[] };
  if (!Array.isArray(data.rounds) || !Array.isArray(data.players)) throw new Error("Not a Medisc backup file");
  await db.transaction("rw", [db.players, db.courses, db.holes, db.rounds, db.holeScores, db.settings], async () => {
    await db.players.bulkPut(data.players);
    await db.courses.bulkPut(data.courses ?? []);
    await db.holes.bulkPut(data.holes ?? []);
    await db.rounds.bulkPut(data.rounds);
    await db.holeScores.bulkPut(data.holeScores ?? []);
    if (data.settings) await db.settings.bulkPut(data.settings);
  });
  return { rounds: data.rounds.length };
}

export async function clearCaches(): Promise<void> {
  await db.overpassCache.clear();
}
