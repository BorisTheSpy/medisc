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

export async function adjustStrokes(scoreId: string, delta: number): Promise<void> {
  const s = await db.holeScores.get(scoreId);
  if (!s) return;
  const base = s.strokes === 0 && delta > 0 ? s.par - 1 : s.strokes;
  await setStrokes(scoreId, base + delta);
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

export async function deleteRound(roundId: string): Promise<void> {
  await db.transaction("rw", db.rounds, db.holeScores, async () => {
    await db.holeScores.where("roundId").equals(roundId).delete();
    await db.rounds.delete(roundId);
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
