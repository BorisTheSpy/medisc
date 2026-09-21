import { Dexie, type EntityTable } from "dexie";
import type { Course, Hole, HoleScore, Layout, OverpassCacheEntry, Player, Round, Setting } from "@/domain/types";
import { MAIN_LAYOUT } from "@/domain/layouts";

export type MediscDB = Dexie & {
  players: EntityTable<Player, "id">;
  courses: EntityTable<Course, "id">;
  holes: EntityTable<Hole, "id">;
  layouts: EntityTable<Layout, "id">;
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

// Layouts: holes now belong to a named layout. Everything stored before this is the main layout.
db.version(2)
  .stores({
    players: "id, name, isMe, lastPlayedAt, updatedAt",
    courses: "id, name, source, [osmType+osmId], updatedAt",
    holes: "id, courseId, [courseId+number], [courseId+layoutId], updatedAt",
    layouts: "id, courseId, updatedAt",
    rounds: "id, courseId, startedAt, finishedAt, *playerIds, updatedAt",
    holeScores: "id, roundId, playerId, [roundId+playerId], [roundId+holeNumber], updatedAt",
    settings: "key",
    overpassCache: "key, fetchedAt",
  })
  .upgrade((tx) =>
    tx
      .table("holes")
      .toCollection()
      .modify((h: Hole) => {
        if (!h.layoutId) h.layoutId = MAIN_LAYOUT;
      }),
  );

export async function dbAvailable(): Promise<boolean> {
  try {
    await db.open();
    return true;
  } catch {
    return false;
  }
}
