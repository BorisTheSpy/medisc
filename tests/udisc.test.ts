import { describe, it, expect } from "vitest";
import { parseUdiscCsv } from "../src/domain/udisc";

const CSV = `PlayerName,CourseName,LayoutName,StartDate,EndDate,Total,+/-,RoundRating,Hole1,Hole2,Hole3,Hole4
Par,Blair Mill Park,Main,2026-08-30 1402,2026-08-30 1510,12,,,3,3,3,3
Ivan,Blair Mill Park,Main,2026-08-30 1402,2026-08-30 1510,11,-1,210,3,2,3,3
Bob,Blair Mill Park,Main,2026-08-30 1402,2026-08-30 1510,14,2,,4,3,4,3
Par,Squirrel Lake Park,Short Tees,2026-09-06 0930,2026-09-06 1030,7,,,3,4,,
Ivan,Squirrel Lake Park,Short Tees,2026-09-06 0930,2026-09-06 1030,8,1,,3,5,,
`;

describe("udisc csv", () => {
  const out = parseUdiscCsv(CSV);

  it("groups rows into rounds with pars", () => {
    expect(out.rounds).toHaveLength(2);
    const r = out.rounds[0];
    expect(r.courseName).toBe("Blair Mill Park");
    expect(r.layoutName).toBe("Main");
    expect(r.pars).toEqual([3, 3, 3, 3]);
    expect(r.players.map((p) => p.name)).toEqual(["Ivan", "Bob"]);
    expect(r.players[1].scores).toEqual([4, 3, 4, 3]);
    expect(new Date(r.startedAt).getFullYear()).toBe(2026);
  });

  it("trims holes that have no par (shorter layouts)", () => {
    const r = out.rounds[1];
    expect(r.pars).toEqual([3, 4]);
    expect(r.players[0].scores).toEqual([3, 5]);
  });

  it("lists distinct player names and layouts", () => {
    expect(out.playerNames).toEqual(["Ivan", "Bob"]);
    expect(out.layouts.map((l) => `${l.courseName}|${l.layoutName}`)).toEqual(["Blair Mill Park|Main", "Squirrel Lake Park|Short Tees"]);
  });

  it("rejects files that are not a UDisc export", () => {
    expect(() => parseUdiscCsv("a,b,c\n1,2,3")).toThrow();
  });
});
