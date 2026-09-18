import { db } from "@/db/db";
import { getSetting, setSetting, mergePlayerInto, uuid } from "@/db/repo";
import { getToken, getUser, sessionExpired, type User } from "./auth";
import type { Course, HoleScore, Player, Round } from "@/domain/types";

type RoundDoc = Round & { scores: HoleScore[] };

const SINCE_KEY = "sync.since";
let timer: number | null = null;
let running: Promise<void> | null = null;
let hooksInstalled = false;

/** Schedule a sync shortly after any local write. */
export function scheduleSync(delayMs = 2500): void {
  if (!getToken()) return;
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    syncNow().catch(() => {});
  }, delayMs);
}

/** Dexie hooks so every write to rounds, scores or players triggers a sync. */
export function installSyncHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;
  const tables = [db.rounds, db.holeScores, db.players];
  for (const t of tables) {
    t.hook("creating", () => scheduleSync());
    t.hook("updating", () => scheduleSync());
    t.hook("deleting", () => scheduleSync());
  }
  window.addEventListener("online", () => scheduleSync(500));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleSync(500);
  });
}

/**
 * Called right after sign-in or sign-up: make the local "me" player use the account id so every
 * device agrees on who I am, then push everything and pull what the account already has.
 */
export async function adoptAccount(user: User): Promise<void> {
  const me = await db.players.filter((p) => p.isMe && !p.deletedAt).first();
  if (me && me.id !== user.id) {
    await mergePlayerInto(me.id, user.id, { name: me.name || user.displayName, color: me.color, isMe: true });
  } else if (!me) {
    const now = Date.now();
    await db.players.put({ id: user.id, name: user.displayName, color: "#E9A83A", isMe: true, createdAt: now, updatedAt: now });
  }
  await setSetting(SINCE_KEY, 0);
  await syncNow(true);
}

async function collectChanges(since: number): Promise<{ players: Player[]; rounds: RoundDoc[] }> {
  const players = (await db.players.toArray()).filter((p) => p.updatedAt > since || (p.deletedAt ?? 0) > since);
  const changedScoreRounds = new Set((await db.holeScores.where("updatedAt").above(since).toArray()).map((s) => s.roundId));
  const rounds = (await db.rounds.toArray()).filter((r) => r.updatedAt > since || (r.deletedAt ?? 0) > since || changedScoreRounds.has(r.id));
  const docs: RoundDoc[] = [];
  for (const r of rounds) {
    const scores = await db.holeScores.where("roundId").equals(r.id).toArray();
    docs.push({ ...r, scores, updatedAt: Math.max(r.updatedAt, r.deletedAt ?? 0, ...scores.map((s) => s.updatedAt)) });
  }
  return { players, rounds: docs };
}

async function ensureCourse(courseId: string, courseName: string): Promise<void> {
  if (await db.courses.get(courseId)) return;
  const now = Date.now();
  let course: Course = { id: courseId, source: "community", name: courseName, lat: 0, lon: 0, holeCount: 18, tags: { __needsLocation: "1" }, createdAt: now, updatedAt: now };
  try {
    const res = await fetch(`/api/community/courses/${encodeURIComponent(courseId)}`);
    const json = (await res.json()) as { course?: { name: string; lat: number; lon: number; holeCount: number; par?: number | null; city?: string | null; region?: string | null } | null };
    if (json.course) {
      course = { ...course, name: json.course.name, lat: json.course.lat, lon: json.course.lon, holeCount: json.course.holeCount, par: json.course.par ?? undefined, city: json.course.city ?? undefined, region: json.course.region ?? undefined, tags: undefined };
    }
  } catch {
    /* offline: placeholder until the course page syncs */
  }
  await db.courses.put(course);
}

async function applyRemote(players: Player[], rounds: RoundDoc[]): Promise<void> {
  for (const p of players) {
    const local = await db.players.get(p.id);
    if (!local || p.updatedAt >= local.updatedAt) await db.players.put({ ...p, isMe: p.id === getUser()?.id ? true : (local?.isMe ?? false) && !p.deletedAt });
  }
  for (const doc of rounds) {
    const { scores, ...round } = doc;
    const local = await db.rounds.get(round.id);
    if (local && local.updatedAt > round.updatedAt && !round.deletedAt) continue;
    await ensureCourse(round.courseId, round.courseName);
    await db.transaction("rw", db.rounds, db.holeScores, async () => {
      await db.rounds.put(round);
      const keep = new Set(scores.map((s) => s.id));
      for (const s of scores) {
        const ls = await db.holeScores.get(s.id);
        if (!ls || s.updatedAt >= ls.updatedAt) await db.holeScores.put(s);
      }
      const stale = (await db.holeScores.where("roundId").equals(round.id).toArray()).filter((s) => !keep.has(s.id));
      for (const s of stale) await db.holeScores.delete(s.id);
    });
  }
}

export async function syncNow(full = false): Promise<void> {
  const token = getToken();
  if (!token) return;
  if (running) return running;
  running = (async () => {
    const since = full ? 0 : await getSetting<number>(SINCE_KEY, 0);
    const changes = await collectChanges(since);
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ since, players: changes.players, rounds: changes.rounds }),
    });
    if (res.status === 401) {
      sessionExpired();
      return;
    }
    if (!res.ok) throw new Error(`Sync failed (${res.status})`);
    const json = (await res.json()) as { now: number; players: Player[]; rounds: RoundDoc[] };
    await applyRemote(json.players, json.rounds);
    await setSetting(SINCE_KEY, json.now);
  })().finally(() => {
    running = null;
  });
  return running;
}

export { uuid };
