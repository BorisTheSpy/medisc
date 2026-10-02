import type { HoleScore, Round } from "./types";

/**
 * One round and its scores as a single sync document. `updatedAt` is the newest time anywhere in
 * the document; `metaUpdatedAt` is the round's own time, so a late score does not drag the round's
 * fields along with it.
 */
export interface RoundDoc extends Round {
  scores: HoleScore[];
  metaUpdatedAt?: number;
}

/** Another account holder, as the server describes them. Name and colour come from their own "me" player. */
export interface Person {
  id: string;
  username: string;
  displayName: string;
  name?: string;
  color?: string;
}

export function metaTime(d: RoundDoc): number {
  return d.metaUpdatedAt ?? d.updatedAt;
}

export function toRoundDoc(round: Round, scores: HoleScore[]): RoundDoc {
  return {
    ...round,
    scores,
    metaUpdatedAt: round.updatedAt,
    updatedAt: Math.max(round.updatedAt, round.deletedAt ?? 0, ...scores.map((s) => s.updatedAt)),
  };
}

/**
 * Merge two copies of the same round. Round fields come from the newer `metaUpdatedAt`, scores are
 * matched by id and the newer wins, and scores for players no longer on the card are dropped.
 * Symmetric, so the server and every phone reach the same answer in any order.
 */
export function mergeRoundDocs(a: RoundDoc, b: RoundDoc): RoundDoc {
  const newer = metaTime(b) >= metaTime(a) ? b : a;
  const older = newer === b ? a : b;
  const { scores: _ignored, ...meta } = newer;
  void _ignored;
  const byId = new Map<string, HoleScore>();
  for (const s of [...older.scores, ...newer.scores]) {
    const have = byId.get(s.id);
    if (!have || s.updatedAt >= have.updatedAt) byId.set(s.id, s);
  }
  const onCard = new Set(meta.playerIds);
  const scores = [...byId.values()].filter((s) => onCard.has(s.playerId) && meta.holeNumbers.includes(s.holeNumber));
  const metaUpdatedAt = metaTime(newer);
  return {
    ...meta,
    scores,
    metaUpdatedAt,
    updatedAt: Math.max(metaUpdatedAt, meta.deletedAt ?? 0, ...scores.map((s) => s.updatedAt)),
  };
}

/** True when the card carries any account holder other than `myId`. */
export function isSharedRound(round: Pick<Round, "playerIds">, accountIds: Set<string>, myId: string | undefined): boolean {
  return round.playerIds.some((id) => id !== myId && accountIds.has(id));
}
