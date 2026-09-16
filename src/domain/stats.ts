import type { HoleScore, Player, Round, Zone } from "./types";
import { scoreLabel, type ScoreLabel } from "./scoring";

export type RangeKey = "last1" | "last5" | "last20" | "year" | "all";

const WEEK = 7 * 86_400_000;

function finished(rounds: Round[]): Round[] {
  return rounds.filter((r) => !r.deletedAt);
}

function byRound(scores: HoleScore[]): Map<string, HoleScore[]> {
  const m = new Map<string, HoleScore[]>();
  for (const s of scores) {
    const arr = m.get(s.roundId) ?? [];
    arr.push(s);
    m.set(s.roundId, arr);
  }
  return m;
}

export interface RoundResult {
  roundId: string;
  courseId: string;
  courseName: string;
  startedAt: number;
  strokes: number;
  par: number;
  toPar: number;
  holes: number;
}

/** One result per round for one player, chronological, only holes with a score. */
export function playerResults(rounds: Round[], scores: HoleScore[], playerId: string): RoundResult[] {
  const grouped = byRound(scores);
  const results: RoundResult[] = [];
  for (const r of finished(rounds)) {
    const mine = (grouped.get(r.id) ?? []).filter((s) => s.playerId === playerId && s.strokes > 0);
    if (mine.length === 0) continue;
    const strokes = mine.reduce((a, s) => a + s.strokes, 0);
    const par = mine.reduce((a, s) => a + s.par, 0);
    results.push({ roundId: r.id, courseId: r.courseId, courseName: r.courseName, startedAt: r.startedAt, strokes, par, toPar: strokes - par, holes: mine.length });
  }
  results.sort((a, b) => a.startedAt - b.startedAt);
  return results;
}

export function filterRange(rounds: Round[], range: RangeKey, now = Date.now()): Round[] {
  const sorted = [...finished(rounds)].sort((a, b) => b.startedAt - a.startedAt);
  switch (range) {
    case "last1":
      return sorted.slice(0, 1);
    case "last5":
      return sorted.slice(0, 5);
    case "last20":
      return sorted.slice(0, 20);
    case "year": {
      const start = new Date(now);
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      return sorted.filter((r) => r.startedAt >= start.getTime());
    }
    default:
      return sorted;
  }
}

export interface Overview {
  rounds: number;
  holes: number;
  coursesPlayed: number;
  avgToPar: number | null;
  bestToPar: number | null;
  avgStrokesPerHole: number | null;
  birdieRate: number;
  parOrBetterRate: number;
  bogeyOrWorseRate: number;
}

function myScores(rounds: Round[], scores: HoleScore[], playerId: string): HoleScore[] {
  const ids = new Set(finished(rounds).map((r) => r.id));
  return scores.filter((s) => s.playerId === playerId && s.strokes > 0 && ids.has(s.roundId));
}

export function overview(rounds: Round[], scores: HoleScore[], playerId: string): Overview {
  const results = playerResults(rounds, scores, playerId);
  const holes = myScores(rounds, scores, playerId);
  const labels = holes.map((h) => scoreLabel(h.strokes, h.par));
  const under = labels.filter((l) => l === "ace" || l === "eagle" || l === "birdie").length;
  const parOrBetter = under + labels.filter((l) => l === "par").length;
  return {
    rounds: results.length,
    holes: holes.length,
    coursesPlayed: new Set(results.map((r) => r.courseId)).size,
    avgToPar: results.length ? results.reduce((a, r) => a + r.toPar, 0) / results.length : null,
    bestToPar: results.length ? Math.min(...results.map((r) => r.toPar)) : null,
    avgStrokesPerHole: holes.length ? holes.reduce((a, h) => a + h.strokes, 0) / holes.length : null,
    birdieRate: holes.length ? under / holes.length : 0,
    parOrBetterRate: holes.length ? parOrBetter / holes.length : 0,
    bogeyOrWorseRate: holes.length ? (holes.length - parOrBetter) / holes.length : 0,
  };
}

export type Distribution = Record<Exclude<ScoreLabel, "unscored">, number>;

export function distribution(rounds: Round[], scores: HoleScore[], playerId: string): Distribution {
  const d: Distribution = { ace: 0, eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, triple: 0 };
  for (const h of myScores(rounds, scores, playerId)) {
    const l = scoreLabel(h.strokes, h.par);
    if (l !== "unscored") d[l] += 1;
  }
  return d;
}

export interface FormPoint {
  roundId: string;
  date: number;
  toPar: number;
  courseName: string;
  holes: number;
}

export function formSeries(rounds: Round[], scores: HoleScore[], playerId: string): FormPoint[] {
  return playerResults(rounds, scores, playerId).map((r) => ({ roundId: r.roundId, date: r.startedAt, toPar: r.toPar, courseName: r.courseName, holes: r.holes }));
}

export function bestRounds(rounds: Round[], scores: HoleScore[], playerId: string, limit = 5): RoundResult[] {
  return playerResults(rounds, scores, playerId)
    .sort((a, b) => a.toPar - b.toPar || b.startedAt - a.startedAt)
    .slice(0, limit);
}

export interface AceRecord {
  roundId: string;
  courseName: string;
  holeNumber: number;
  date: number;
}

export interface BestShots {
  aces: AceRecord[];
  eagles: number;
  longestBirdieStreak: number;
  mostBirdiesInRound: { roundId: string; courseName: string; count: number; date: number } | null;
  longestHoleBirdied: { courseName: string; holeNumber: number; distanceM?: number } | null;
}

export function bestShots(rounds: Round[], scores: HoleScore[], playerId: string): BestShots {
  const roundsById = new Map(finished(rounds).map((r) => [r.id, r]));
  const grouped = byRound(myScores(rounds, scores, playerId));
  const aces: AceRecord[] = [];
  let eagles = 0;
  let longestStreak = 0;
  let mostBirdies: BestShots["mostBirdiesInRound"] = null;

  const orderedRounds = [...roundsById.values()].sort((a, b) => a.startedAt - b.startedAt);
  for (const r of orderedRounds) {
    const holes = (grouped.get(r.id) ?? []).sort((a, b) => {
      // Play order: starting hole first, wrapping around.
      const order = (n: number) => (n - r.startingHole + r.holeNumbers.length * 2) % Math.max(r.holeNumbers.length, 1);
      return order(a.holeNumber) - order(b.holeNumber);
    });
    let streak = 0;
    let birdies = 0;
    for (const h of holes) {
      const l = scoreLabel(h.strokes, h.par);
      if (l === "ace") aces.push({ roundId: r.id, courseName: r.courseName, holeNumber: h.holeNumber, date: r.startedAt });
      if (l === "eagle") eagles += 1;
      if (l === "ace" || l === "eagle" || l === "birdie") {
        birdies += 1;
        streak += 1;
        longestStreak = Math.max(longestStreak, streak);
      } else {
        streak = 0;
      }
    }
    if (birdies > 0 && (!mostBirdies || birdies > mostBirdies.count)) {
      mostBirdies = { roundId: r.id, courseName: r.courseName, count: birdies, date: r.startedAt };
    }
  }
  return { aces, eagles, longestBirdieStreak: longestStreak, mostBirdiesInRound: mostBirdies, longestHoleBirdied: null };
}

export interface Ratio {
  made: number;
  attempts: number;
}

export interface ThrowStats {
  holesTracked: number;
  fairwayHit: number;
  c1InReg: number;
  c2InReg: number;
  parked: number;
  scramble: number;
  obRate: number;
  throwIns: number;
  c1Putting: Ratio;
  c1xPutting: Ratio;
  c2Putting: Ratio;
}

const IN_C1 = (z: Zone) => z === "c1" || z === "parked";
const IN_C2 = (z: Zone) => z === "c2" || IN_C1(z);

export function throwStats(rounds: Round[], scores: HoleScore[], playerId: string): ThrowStats {
  const tracked = myScores(rounds, scores, playerId).filter((h) => h.throws && h.throws.length > 0 && h.throws[h.throws.length - 1] === "basket");
  const n = tracked.length;
  let fairway = 0;
  let c1reg = 0;
  let c2reg = 0;
  let parked = 0;
  let scrambleOpp = 0;
  let scrambleMade = 0;
  let obHoles = 0;
  let throwIns = 0;
  const c1: Ratio = { made: 0, attempts: 0 };
  const c1x: Ratio = { made: 0, attempts: 0 };
  const c2: Ratio = { made: 0, attempts: 0 };

  for (const h of tracked) {
    const t = h.throws!;
    const par = h.par;
    // Drive accuracy: fairway or anything inside circle 2 is a hit. Par 5s need the first two throws.
    const GOOD = (z: Zone | undefined) => z !== undefined && (z === "fairway" || IN_C2(z) || z === "basket");
    if (par >= 5) {
      if (GOOD(t[0]) && (t[1] === undefined || GOOD(t[1]))) fairway += 1;
    } else if (GOOD(t[0])) fairway += 1;
    // In regulation: the lie after (par - 2) throws is inside the circle.
    const regIndex = par - 2; // 1-based count of throws
    const lieAfterReg = t[regIndex - 1];
    if (lieAfterReg && (IN_C1(lieAfterReg) || lieAfterReg === "basket")) c1reg += 1;
    if (lieAfterReg && (IN_C2(lieAfterReg) || lieAfterReg === "basket")) c2reg += 1;
    if (lieAfterReg === "parked" || (regIndex - 1 >= 0 && t[regIndex - 1] === "basket")) parked += 1;
    // Scramble: outside C2 after (par - 2) throws, then par or better.
    if (lieAfterReg && !IN_C2(lieAfterReg) && lieAfterReg !== "basket") {
      scrambleOpp += 1;
      if (h.strokes <= par) scrambleMade += 1;
    }
    if (t.includes("ob")) obHoles += 1;
    // Putting: the zone before the basket throw.
    const before = t[t.length - 2];
    if (before === undefined || before === "fairway" || before === "off_fairway" || before === "ob") throwIns += 1;
    else if (before === "parked") {
      c1.attempts += 1;
      c1.made += 1;
    } else if (before === "c1") {
      c1.attempts += 1;
      c1.made += 1;
      c1x.attempts += 1;
      c1x.made += 1;
    } else if (before === "c2") {
      c2.attempts += 1;
      c2.made += 1;
    }
    // Missed putts: any c1/c2 zone followed by another non-basket throw is a missed attempt.
    for (let i = 0; i < t.length - 2; i++) {
      const z = t[i];
      const next = t[i + 1];
      if (next === "basket") continue;
      if (z === "parked") c1.attempts += 1;
      else if (z === "c1") {
        c1.attempts += 1;
        c1x.attempts += 1;
      } else if (z === "c2") c2.attempts += 1;
    }
  }

  const rate = (x: number) => (n ? x / n : 0);
  return {
    holesTracked: n,
    fairwayHit: rate(fairway),
    c1InReg: rate(c1reg),
    c2InReg: rate(c2reg),
    parked: rate(parked),
    scramble: scrambleOpp ? scrambleMade / scrambleOpp : 0,
    obRate: rate(obHoles),
    throwIns,
    c1Putting: c1,
    c1xPutting: c1x,
    c2Putting: c2,
  };
}

export interface CourseBreakdown {
  courseId: string;
  courseName: string;
  rounds: number;
  bestToPar: number;
  avgToPar: number;
  lastPlayed: number;
}

export function perCourse(rounds: Round[], scores: HoleScore[], playerId: string): CourseBreakdown[] {
  const results = playerResults(rounds, scores, playerId);
  const m = new Map<string, CourseBreakdown>();
  for (const r of results) {
    const c = m.get(r.courseId) ?? { courseId: r.courseId, courseName: r.courseName, rounds: 0, bestToPar: Infinity, avgToPar: 0, lastPlayed: 0 };
    c.rounds += 1;
    c.bestToPar = Math.min(c.bestToPar, r.toPar);
    c.avgToPar += r.toPar;
    c.lastPlayed = Math.max(c.lastPlayed, r.startedAt);
    c.courseName = r.courseName;
    m.set(r.courseId, c);
  }
  return [...m.values()]
    .map((c) => ({ ...c, avgToPar: c.avgToPar / c.rounds }))
    .sort((a, b) => b.rounds - a.rounds || b.lastPlayed - a.lastPlayed);
}

export interface HoleStat {
  holeNumber: number;
  par: number;
  plays: number;
  avgStrokes: number;
  avgToPar: number;
  best: number;
  birdieRate: number;
}

export function holeStatsForCourse(rounds: Round[], scores: HoleScore[], playerId: string, courseId: string): HoleStat[] {
  const roundIds = new Set(finished(rounds).filter((r) => r.courseId === courseId).map((r) => r.id));
  const m = new Map<number, HoleStat>();
  for (const s of scores) {
    if (s.playerId !== playerId || s.strokes <= 0 || !roundIds.has(s.roundId)) continue;
    const h = m.get(s.holeNumber) ?? { holeNumber: s.holeNumber, par: s.par, plays: 0, avgStrokes: 0, avgToPar: 0, best: Infinity, birdieRate: 0 };
    h.plays += 1;
    h.avgStrokes += s.strokes;
    h.avgToPar += s.strokes - s.par;
    h.best = Math.min(h.best, s.strokes);
    if (s.strokes < s.par) h.birdieRate += 1;
    h.par = s.par;
    m.set(s.holeNumber, h);
  }
  return [...m.values()]
    .map((h) => ({ ...h, avgStrokes: h.avgStrokes / h.plays, avgToPar: h.avgToPar / h.plays, birdieRate: h.birdieRate / h.plays }))
    .sort((a, b) => a.holeNumber - b.holeNumber);
}

export interface HeadToHead {
  playerId: string;
  name: string;
  rounds: number;
  wins: number;
  losses: number;
  ties: number;
}

export function headToHead(rounds: Round[], scores: HoleScore[], playerId: string, players: Player[]): HeadToHead[] {
  const grouped = byRound(scores);
  const names = new Map(players.map((p) => [p.id, p.name]));
  const m = new Map<string, HeadToHead>();
  for (const r of finished(rounds)) {
    if (!r.playerIds.includes(playerId)) continue;
    const all = grouped.get(r.id) ?? [];
    const totals = new Map<string, { strokes: number; par: number; holes: number }>();
    for (const s of all) {
      if (s.strokes <= 0) continue;
      const t = totals.get(s.playerId) ?? { strokes: 0, par: 0, holes: 0 };
      t.strokes += s.strokes;
      t.par += s.par;
      t.holes += 1;
      totals.set(s.playerId, t);
    }
    const mine = totals.get(playerId);
    if (!mine) continue;
    for (const other of r.playerIds) {
      if (other === playerId) continue;
      const theirs = totals.get(other);
      if (!theirs || theirs.holes !== mine.holes) continue;
      const h = m.get(other) ?? { playerId: other, name: names.get(other) ?? "Player", rounds: 0, wins: 0, losses: 0, ties: 0 };
      h.rounds += 1;
      const myTo = mine.strokes - mine.par;
      const theirTo = theirs.strokes - theirs.par;
      if (myTo < theirTo) h.wins += 1;
      else if (myTo > theirTo) h.losses += 1;
      else h.ties += 1;
      m.set(other, h);
    }
  }
  return [...m.values()].sort((a, b) => b.rounds - a.rounds);
}

function weekStart(t: number): number {
  const d = new Date(t);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  return d.getTime() - day * 86_400_000;
}

/** Consecutive weeks (Mon–Sun) with at least one round, counting back from the current week. */
export function weeklyStreak(rounds: Round[], now = Date.now()): number {
  const weeks = new Set(finished(rounds).map((r) => weekStart(r.startedAt)));
  if (weeks.size === 0) return 0;
  let cursor = weekStart(now);
  // Allow the current week to be empty so a streak survives until the week ends.
  if (!weeks.has(cursor)) cursor -= WEEK;
  let streak = 0;
  while (weeks.has(cursor)) {
    streak += 1;
    cursor -= WEEK;
  }
  return streak;
}
