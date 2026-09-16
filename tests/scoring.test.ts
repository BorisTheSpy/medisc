import { describe, it, expect } from "vitest";
import { toPar, scoreLabel, strokesFromThrows, penaltiesFromThrows, formatToPar, roundTotals, SCORE_LABELS } from "../src/domain/scoring";
import type { HoleScore } from "../src/domain/types";

const hs = (playerId: string, holeNumber: number, par: number, strokes: number): HoleScore => ({
  id: `${playerId}-${holeNumber}`,
  roundId: "r1",
  playerId,
  holeNumber,
  par,
  strokes,
  penalties: 0,
  updatedAt: 0,
});

describe("scoring", () => {
  it("computes relative to par", () => {
    expect(toPar(3, 3)).toBe(0);
    expect(toPar(2, 3)).toBe(-1);
    expect(toPar(6, 3)).toBe(3);
  });

  it("labels scores", () => {
    expect(scoreLabel(1, 3)).toBe("ace");
    expect(scoreLabel(1, 1)).toBe("ace");
    expect(scoreLabel(2, 4)).toBe("eagle");
    expect(scoreLabel(2, 3)).toBe("birdie");
    expect(scoreLabel(3, 3)).toBe("par");
    expect(scoreLabel(4, 3)).toBe("bogey");
    expect(scoreLabel(5, 3)).toBe("double");
    expect(scoreLabel(7, 3)).toBe("triple");
    expect(scoreLabel(0, 3)).toBe("unscored");
    expect(SCORE_LABELS).toContain("birdie");
  });

  it("derives strokes and penalties from throws", () => {
    expect(strokesFromThrows(["fairway", "c1", "basket"])).toBe(3);
    expect(strokesFromThrows(["ob", "fairway", "basket"])).toBe(4);
    expect(penaltiesFromThrows(["ob", "fairway", "ob", "basket"])).toBe(2);
    expect(strokesFromThrows([])).toBe(0);
  });

  it("formats to-par", () => {
    expect(formatToPar(0)).toBe("E");
    expect(formatToPar(-3)).toBe("-3");
    expect(formatToPar(2)).toBe("+2");
  });

  it("totals a round per player, ignoring unscored holes", () => {
    const scores = [hs("a", 1, 3, 3), hs("a", 2, 3, 2), hs("a", 3, 4, 0), hs("b", 1, 3, 4), hs("b", 2, 3, 3)];
    const totals = roundTotals(scores);
    expect(totals.get("a")).toEqual({ strokes: 5, par: 6, toPar: -1, holesScored: 2 });
    expect(totals.get("b")).toEqual({ strokes: 7, par: 6, toPar: 1, holesScored: 2 });
  });
});
