import { db } from "@/db/db";
import { getSetting, setSetting, mergePlayerInto, uuid, PLAYER_COLORS } from "@/db/repo";
import { getToken, getUser, sessionExpired, type User } from "./auth";
import { mergeRoundDocs, toRoundDoc, type Person, type RoundDoc } from "@/domain/sync";
import type { Course, HoleScore, Player, Round } from "@/domain/types";

const SINCE_KEY = "sync.since";
let timer: number | null = null;
let running: Promise<void> | null = null;
let hooksInstalled = false;

/** Scorecards open on a shared round. While any are, writes sync sooner and the server is polled. */
let liveWatchers = 0;
let liveTimer: number | null = null;

/** Schedule a sync shortly after any local write. */
export function scheduleSync(delayMs = liveWatchers > 0 ? 800 : 2500): void {
  if (!getToken()) return;
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    syncNow().catch(() => {});
  }, delayMs);
}

/**
 * Poll the server while a shared scorecard is open, so a cardmate's taps show up within a few
 * seconds. Returns a function that stops polling for this caller.
 */
export function startLivePolling(intervalMs = 4000): () => void {
  liveWatchers++;
  const tick = () => {
    if (document.visibilityState !== "visible" || navigator.onLine === false) return;
    syncNow().catch(() => {});
  };
  if (liveWatchers === 1) {
    tick();
    liveTimer = window.setInterval(tick, intervalMs);
  }
  return () => {
    liveWatchers = Math.max(0, liveWatchers - 1);
    if (liveWatchers === 0 && liveTimer !== null) {
      window.clearInterval(liveTimer);
      liveTimer = null;
    }
  };
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

/** Friends are other accounts' players: never pushed under my account, or the server would refuse theirs. */
function isForeignAccount(p: Player, myId: string | undefined): boolean {
  return !!p.username && p.id !== myId;
}

async function collectChanges(since: number): Promise<{ players: Player[]; rounds: RoundDoc[] }> {
  const myId = getUser()?.id;
  const players = (await db.players.toArray()).filter((p) => (p.updatedAt > since || (p.deletedAt ?? 0) > since) && !isForeignAccount(p, myId));
  const changedScoreRounds = new Set((await db.holeScores.where("updatedAt").above(since).toArray()).map((s) => s.roundId));
  const rounds = (await db.rounds.toArray()).filter((r) => r.updatedAt > since || (r.deletedAt ?? 0) > since || changedScoreRounds.has(r.id));
  const docs: RoundDoc[] = [];
  for (const r of rounds) {
    const scores = await db.holeScores.where("roundId").equals(r.id).toArray();
    docs.push(toRoundDoc(r, scores));
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

function colorFor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PLAYER_COLORS[h % PLAYER_COLORS.length];
}

/** Make sure every account holder the server mentions exists locally as a player. */
export async function ensurePeople(people: Person[]): Promise<void> {
  const myId = getUser()?.id;
  const now = Date.now();
  for (const person of people) {
    if (!person || typeof person.id !== "string" || person.id === myId) continue;
    const name = person.name || person.displayName || person.username;
    const local = await db.players.get(person.id);
    if (!local) {
      await db.players.put({ id: person.id, name, color: person.color || colorFor(person.id), username: person.username, isMe: false, createdAt: now, updatedAt: now });
    } else if (local.name !== name || local.username !== person.username || (person.color && local.color !== person.color) || local.deletedAt) {
      await db.players.put({ ...local, name, username: person.username, color: person.color || local.color, deletedAt: undefined, updatedAt: now });
    }
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function applyRound(doc: RoundDoc): Promise<void> {
  const local = await db.rounds.get(doc.id);
  await ensureCourse(doc.courseId, doc.courseName);
  await db.transaction("rw", db.rounds, db.holeScores, async () => {
    const localScores: HoleScore[] = local ? await db.holeScores.where("roundId").equals(doc.id).toArray() : [];
    const merged = local ? mergeRoundDocs(toRoundDoc(local, localScores), doc) : doc;
    const { scores, metaUpdatedAt, ...meta } = merged;
    // The round's own time is its meta time; the document's max time is only the sync cursor.
    const round: Round = { ...meta, updatedAt: metaUpdatedAt ?? meta.updatedAt };
    if (!local || !same(local, round)) await db.rounds.put(round);
    const keep = new Set(scores.map((s) => s.id));
    const byId = new Map(localScores.map((s) => [s.id, s]));
    for (const s of scores) {
      const ls = byId.get(s.id);
      if (!ls || !same(ls, s)) await db.holeScores.put(s);
    }
    for (const s of localScores) if (!keep.has(s.id)) await db.holeScores.delete(s.id);
  });
}

async function applyRemote(players: Player[], rounds: RoundDoc[], people: Person[]): Promise<void> {
  for (const p of players) {
    const local = await db.players.get(p.id);
    if (!local || p.updatedAt >= local.updatedAt) await db.players.put({ ...p, isMe: p.id === getUser()?.id ? true : (local?.isMe ?? false) && !p.deletedAt });
  }
  await ensurePeople(people);
  for (const doc of rounds) await applyRound({ ...doc, scores: Array.isArray(doc.scores) ? doc.scores : [] });
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
    const json = (await res.json()) as { now: number; players: Player[]; rounds: RoundDoc[]; people?: Person[] };
    await applyRemote(json.players, json.rounds, json.people ?? []);
    await setSetting(SINCE_KEY, json.now);
  })().finally(() => {
    running = null;
  });
  return running;
}

export { uuid };
