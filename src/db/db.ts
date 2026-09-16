import { Dexie, type EntityTable } from "dexie";
import type { Course, Hole, HoleScore, OverpassCacheEntry, Player, Round, Setting } from "@/domain/types";

export type MediscDB = Dexie & {
  players: EntityTable<Player, "id">;
  courses: EntityTable<Course, "id">;
  holes: EntityTable<Hole, "id">;
  rounds: EntityTable<Round, "id">;
  holeScores: EntityTable<HoleScore, "id">;
  settings: EntityTable<Setting, "key">;
  overpassCache: EntityTable<OverpassCacheEntry, "key">;
};

export const db = new Dexie("medisc") as MediscDB;

db.version(1).stores({
  players: "id, name, isMe, lastPlayedAt, updatedAt",
  courses: "id, name, source, [osmType+osmId], updatedAt",
  holes: "id, courseId, [courseId+number], updatedAt",
  rounds: "id, courseId, startedAt, finishedAt, *playerIds, updatedAt",
  holeScores: "id, roundId, playerId, [roundId+playerId], [roundId+holeNumber], updatedAt",
  settings: "key",
  overpassCache: "key, fetchedAt",
});

export async function dbAvailable(): Promise<boolean> {
  try {
    await db.open();
    return true;
  } catch {
    return false;
  }
}
