import { describe, it, expect } from "vitest";
import { mergeRoundDocs, toRoundDoc, isSharedRound, type RoundDoc } from "../src/domain/sync";
import type { HoleScore, Round } from "../src/domain/types";

const round = (over: Partial<Round> = {}): Round => ({
  id: "r1",
  courseId: "c1",
  courseName: "Test Park",
  startedAt: 100,
  playerIds: ["me", "friend"],
  holeNumbers: [1, 2],
  startingHole: 1,
  trackThrows: false,
  createdAt: 100,
  updatedAt: 100,
  ...over,
});

const score = (playerId: string, holeNumber: number, strokes: number, updatedAt: number): HoleScore => ({
  id: `r1-${playerId}-${holeNumber}`,
  roundId: "r1",
  playerId,
  holeNumber,
  par: 3,
  strokes,
  penalties: 0,
  updatedAt,
});

const doc = (r: Round, scores: HoleScore[]): RoundDoc => toRoundDoc(r, scores);

describe("round merge", () => {
  it("keeps the newer copy of each score, whichever side it came from", () => {
    const mine = doc(round(), [score("me", 1, 3, 200), score("friend", 1, 4, 150)]);
    const theirs = doc(round(), [score("me", 1, 3, 200), score("friend", 1, 2, 260)]);
    const m = mergeRoundDocs(mine, theirs);
    expect(m.scores.find((s) => s.playerId === "friend")?.strokes).toBe(2);
    expect(m.updatedAt).toBe(260);
    expect(mergeRoundDocs(theirs, mine)).toEqual(m);
  });

  it("takes round fields from the side with the newer round time only", () => {
    const mine = doc(round({ name: "Sunday", updatedAt: 300 }), [score("me", 1, 3, 100)]);
    const theirs = doc(round({ updatedAt: 100 }), [score("me", 1, 3, 100), score("friend", 2, 5, 900)]);
    const m = mergeRoundDocs(mine, theirs);
    expect(m.name).toBe("Sunday");
    expect(m.scores).toHaveLength(2);
    expect(m.metaUpdatedAt).toBe(300);
    expect(m.updatedAt).toBe(900);
  });

  it("drops scores for a player removed from the card", () => {
    const before = doc(round(), [score("me", 1, 3, 100), score("friend", 1, 4, 100)]);
    const after = doc(round({ playerIds: ["me"], updatedAt: 500 }), [score("me", 1, 3, 100)]);
    expect(mergeRoundDocs(before, after).scores.map((s) => s.playerId)).toEqual(["me"]);
  });

  it("keeps a player added on one side until the other hears about it", () => {
    const mine = doc(round({ playerIds: ["me", "friend", "guest"], updatedAt: 400 }), [score("me", 1, 3, 100), score("guest", 1, 3, 400)]);
    const theirs = doc(round(), [score("me", 1, 3, 100), score("friend", 1, 4, 120)]);
    const m = mergeRoundDocs(theirs, mine);
    expect(m.playerIds).toEqual(["me", "friend", "guest"]);
    expect(m.scores.map((s) => s.playerId).sort()).toEqual(["friend", "guest", "me"]);
  });

  it("lets a delete win when it is the newer round change", () => {
    const live = doc(round(), [score("me", 1, 3, 100)]);
    const gone = doc(round({ deletedAt: 700, updatedAt: 700 }), []);
    expect(mergeRoundDocs(live, gone).deletedAt).toBe(700);
  });
});

describe("isSharedRound", () => {
  it("is shared only when another account holder is on the card", () => {
    const accounts = new Set(["me", "friend"]);
    expect(isSharedRound({ playerIds: ["me", "friend"] }, accounts, "me")).toBe(true);
    expect(isSharedRound({ playerIds: ["me", "guest"] }, accounts, "me")).toBe(false);
    expect(isSharedRound({ playerIds: ["me"] }, accounts, "me")).toBe(false);
    expect(isSharedRound({ playerIds: ["me", "guest"], sharedWith: ["friend"] }, accounts, "me")).toBe(true);
    expect(isSharedRound({ playerIds: ["me"], sharedWith: ["stranger"] }, accounts, "me")).toBe(false);
  });
});
