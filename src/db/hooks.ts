import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import type { Course, Hole, HoleScore, Player, Round } from "@/domain/types";

export function useMe(): Player | undefined | null {
  return useLiveQuery(async () => (await db.players.filter((p) => p.isMe && !p.deletedAt).first()) ?? null, []);
}

export function usePlayers(): Player[] {
  return useLiveQuery(() => db.players.filter((p) => !p.deletedAt).toArray(), []) ?? [];
}

export function useRounds(): Round[] {
  return useLiveQuery(async () => (await db.rounds.orderBy("startedAt").reverse().toArray()).filter((r) => !r.deletedAt), []) ?? [];
}

export function useLiveRound(): Round | undefined | null {
  return useLiveQuery(async () => {
    const rounds = await db.rounds.orderBy("startedAt").reverse().toArray();
    return rounds.find((r) => !r.finishedAt && !r.deletedAt) ?? null;
  }, []);
}

export function useRound(id: string | undefined): Round | undefined | null {
  return useLiveQuery(async () => (id ? (await db.rounds.get(id)) ?? null : null), [id]);
}

export function useRoundScores(roundId: string | undefined): HoleScore[] {
  return useLiveQuery(async (): Promise<HoleScore[]> => (roundId ? db.holeScores.where("roundId").equals(roundId).toArray() : []), [roundId]) ?? [];
}

export function useAllScores(): HoleScore[] {
  return useLiveQuery(() => db.holeScores.toArray(), []) ?? [];
}

export function useCourse(id: string | undefined): Course | undefined | null {
  return useLiveQuery(async () => (id ? (await db.courses.get(id)) ?? null : null), [id]);
}

export function useCourses(): Course[] {
  return useLiveQuery(() => db.courses.filter((c) => !c.deletedAt).toArray(), []) ?? [];
}

export function useHoles(courseId: string | undefined): Hole[] {
  return (
    useLiveQuery(async () => {
      if (!courseId) return [];
      const holes = await db.holes.where("courseId").equals(courseId).toArray();
      return holes.sort((a, b) => a.number - b.number);
    }, [courseId]) ?? []
  );
}

export function useSetting<T>(key: string, fallback: T): T {
  const value = useLiveQuery(async () => {
    const s = await db.settings.get(key);
    return s ? (s.value as T) : fallback;
  }, [key]);
  return value === undefined ? fallback : value;
}
