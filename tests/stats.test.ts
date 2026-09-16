import { describe, it, expect } from "vitest";
import type { HoleScore, Player, Round, Zone } from "../src/domain/types";
import {
  overview, distribution, formSeries, bestRounds, bestShots, throwStats, perCourse, headToHead, weeklyStreak, filterRange, holeStatsForCourse,
} from "../src/domain/stats";

const DAY = 86_400_000;
const me: Player = { id: "me", name: "Ivan", color: "#000", isMe: true, createdAt: 0, updatedAt: 0 };
const bob: Player = { id: "bob", name: "Bob", color: "#111", isMe: false, createdAt: 0, updatedAt: 0 };

function round(id: string, startedAt: number, playerIds: string[], courseId = "c1", courseName = "Paloheinä"): Round {
  return { id, courseId, courseName, startedAt, finishedAt: startedAt + 3_600_000, playerIds, holeNumbers: [1, 2, 3], startingHole: 1, trackThrows: false, createdAt: startedAt, updatedAt: startedAt };
}

function scoresFor(roundId: string, playerId: string, strokes: number[], pars = [3, 3, 4], throws?: Zone[][]): HoleScore[] {
  return strokes.map((s, i) => ({
    id: `${roundId}-${playerId}-${i + 1}`,
    roundId,
    playerId,
    holeNumber: i + 1,
    par: pars[i],
    strokes: s,
    penalties: throws?.[i]?.filter((z) => z === "ob").length ?? 0,
    throws: throws?.[i],
    updatedAt: 0,
  }));
}

// Base time: a Wednesday.
const T0 = Date.UTC(2026, 8, 2, 12);
const rounds: Round[] = [
  round("r1", T0, ["me", "bob"]),
  round("r2", T0 + 7 * DAY, ["me", "bob"]),
  round("r3", T0 + 14 * DAY, ["me"], "c2", "Kivikko"),
];
const scores: HoleScore[] = [
  // r1: me 3,3,4 = E ; bob 4,3,4 = +1
  ...scoresFor("r1", "me", [3, 3, 4]),
  ...scoresFor("r1", "bob", [4, 3, 4]),
  // r2: me 2,2,4 = -2 (two birdies in a row); bob 2,3,5 = E (tie? no: bob = 10 vs par 10 = E) -> me wins
  ...scoresFor("r2", "me", [2, 2, 4], [3, 3, 4], [
    ["fairway", "basket"],
    ["c1", "basket"],
    ["ob", "fairway", "basket"],
  ]),
  ...scoresFor("r2", "bob", [2, 3, 5]),
  // r3: me 1,4,5 = ace + bogey + bogey = 0 vs par 10 -> 10 = E
  ...scoresFor("r3", "me", [1, 4, 5]),
];

describe("stats overview", () => {
  it("summarises my rounds", () => {
    const o = overview(rounds, scores, "me");
    expect(o.rounds).toBe(3);
    expect(o.holes).toBe(9);
    expect(o.bestToPar).toBe(-2);
    expect(o.avgToPar).toBeCloseTo((0 - 2 + 0) / 3, 5);
    expect(o.birdieRate).toBeCloseTo(3 / 9, 5); // r2: 2 birdies, r3: ace counts as birdie-or-better
    expect(o.parOrBetterRate).toBeCloseTo(7 / 9, 5);
    expect(o.coursesPlayed).toBe(2);
  });

  it("returns zeros with no data", () => {
    const o = overview([], [], "me");
    expect(o.rounds).toBe(0);
    expect(o.bestToPar).toBeNull();
  });
});

describe("distribution and form", () => {
  it("counts labels", () => {
    const d = distribution(rounds, scores, "me");
    expect(d.ace).toBe(1);
    expect(d.birdie).toBe(2);
    expect(d.par).toBe(4);
    expect(d.bogey).toBe(2);
    expect(d.double).toBe(0);
  });

  it("builds a chronological form series", () => {
    const f = formSeries(rounds, scores, "me");
    expect(f.map((p) => p.toPar)).toEqual([0, -2, 0]);
    expect(f[0].roundId).toBe("r1");
  });
});

describe("bests", () => {
  it("ranks best rounds by to-par then date", () => {
    const b = bestRounds(rounds, scores, "me", 2);
    expect(b[0].roundId).toBe("r2");
    expect(b[0].toPar).toBe(-2);
    expect(b).toHaveLength(2);
  });

  it("finds best shots", () => {
    const s = bestShots(rounds, scores, "me");
    expect(s.aces).toHaveLength(1);
    expect(s.aces[0].courseName).toBe("Kivikko");
    expect(s.longestBirdieStreak).toBe(2);
    expect(s.mostBirdiesInRound?.count).toBe(2);
    expect(s.mostBirdiesInRound?.roundId).toBe("r2");
  });
});

describe("throw stats", () => {
  it("computes UDisc-style throw stats from zones", () => {
    const t = throwStats(rounds, scores, "me");
    expect(t.holesTracked).toBe(3);
    // Drives: hole1 fairway (hit), hole2 c1 (hit), hole3 ob (miss)
    expect(t.fairwayHit).toBeCloseTo(2 / 3, 5);
    // C1 in reg: par3 -> throw index <= par-2 = 1 => first throw lands c1/parked. hole2 yes.
    expect(t.c1InReg).toBeCloseTo(1 / 3, 5);
    // Putting: hole2 c1 -> basket = one C1 attempt made. hole1 fairway->basket is a throw-in.
    expect(t.c1Putting.made).toBe(1);
    expect(t.c1Putting.attempts).toBe(1);
    expect(t.obRate).toBeCloseTo(1 / 3, 5);
    expect(t.throwIns).toBe(2); // holes 1 and 3 end fairway -> basket
  });

  it("is empty when nothing is tracked", () => {
    const t = throwStats(rounds, scores, "bob");
    expect(t.holesTracked).toBe(0);
  });
});

describe("courses and cardmates", () => {
  it("breaks down per course", () => {
    const pc = perCourse(rounds, scores, "me");
    const palo = pc.find((c) => c.courseId === "c1")!;
    expect(palo.rounds).toBe(2);
    expect(palo.bestToPar).toBe(-2);
    expect(palo.avgToPar).toBe(-1);
  });

  it("computes per-hole stats on a course", () => {
    const hs = holeStatsForCourse(rounds, scores, "me", "c1");
    expect(hs.find((h) => h.holeNumber === 2)!.avgStrokes).toBe(2.5);
    expect(hs.find((h) => h.holeNumber === 2)!.best).toBe(2);
    expect(hs.find((h) => h.holeNumber === 3)!.avgToPar).toBe(0);
  });

  it("computes head to head records", () => {
    const h2h = headToHead(rounds, scores, "me", [me, bob]);
    const vsBob = h2h.find((h) => h.playerId === "bob")!;
    expect(vsBob.rounds).toBe(2);
    expect(vsBob.wins).toBe(2);
    expect(vsBob.losses).toBe(0);
  });
});

describe("streak and range", () => {
  it("counts consecutive weeks with a round ending at the latest round", () => {
    expect(weeklyStreak(rounds, rounds[2].startedAt + DAY)).toBe(3);
    expect(weeklyStreak(rounds, rounds[2].startedAt + 21 * DAY)).toBe(0);
    expect(weeklyStreak([], T0)).toBe(0);
  });

  it("filters by range", () => {
    expect(filterRange(rounds, "last5")).toHaveLength(3);
    expect(filterRange(rounds, "last1")).toHaveLength(1);
    expect(filterRange(rounds, "last1")[0].id).toBe("r3");
    expect(filterRange(rounds, "all")).toHaveLength(3);
  });
});
