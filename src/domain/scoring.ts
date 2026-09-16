import type { HoleScore, Zone } from "./types";

export const SCORE_LABELS = ["ace", "eagle", "birdie", "par", "bogey", "double", "triple"] as const;
export type ScoreLabel = (typeof SCORE_LABELS)[number] | "unscored";

export function toPar(strokes: number, par: number): number {
  return strokes - par;
}

export function scoreLabel(strokes: number, par: number): ScoreLabel {
  if (strokes <= 0) return "unscored";
  if (strokes === 1) return "ace";
  const diff = strokes - par;
  if (diff <= -2) return "eagle";
  if (diff === -1) return "birdie";
  if (diff === 0) return "par";
  if (diff === 1) return "bogey";
  if (diff === 2) return "double";
  return "triple";
}

export function formatToPar(diff: number): string {
  if (diff === 0) return "E";
  return diff > 0 ? `+${diff}` : `${diff}`;
}

export function penaltiesFromThrows(throws: Zone[]): number {
  return throws.filter((z) => z === "ob").length;
}

/** Each entry is one throw; an OB throw adds a penalty stroke on top. */
export function strokesFromThrows(throws: Zone[]): number {
  if (throws.length === 0) return 0;
  return throws.length + penaltiesFromThrows(throws);
}

export interface PlayerTotals {
  strokes: number;
  par: number;
  toPar: number;
  holesScored: number;
}

export function roundTotals(scores: HoleScore[]): Map<string, PlayerTotals> {
  const map = new Map<string, PlayerTotals>();
  for (const s of scores) {
    const t = map.get(s.playerId) ?? { strokes: 0, par: 0, toPar: 0, holesScored: 0 };
    if (s.strokes > 0) {
      t.strokes += s.strokes;
      t.par += s.par;
      t.holesScored += 1;
      t.toPar = t.strokes - t.par;
    }
    map.set(s.playerId, t);
  }
  return map;
}

export function isHoledOut(throws: Zone[] | undefined): boolean {
  return !!throws && throws[throws.length - 1] === "basket";
}
