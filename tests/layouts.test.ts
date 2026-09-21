import { describe, it, expect } from "vitest";
import { MAIN_LAYOUT, formatLengthBin, holeId, layoutsFor, pickLayout, roundLayoutId } from "../src/domain/layouts";
import type { Course, Layout } from "../src/domain/types";

const course: Course = { id: "c1", source: "community", name: "Nevin Park", lat: 35, lon: -80, holeCount: 18, par: 54, createdAt: 1, updatedAt: 1 };
const row = (layoutId: string, name: string, playCount?: number): Layout => ({ id: `c1/${layoutId}`, courseId: "c1", layoutId, name, holeCount: 18, playCount, updatedAt: 1 });

describe("hole ids", () => {
  it("keeps main-layout ids unchanged so pre-layout data still matches", () => {
    expect(holeId("c1", MAIN_LAYOUT, 3)).toBe("c1-3");
  });
  it("namespaces other layouts", () => {
    expect(holeId("c1", "udisc-l12", 3)).toBe("c1-udisc-l12-3");
  });
});

describe("layoutsFor", () => {
  it("gives a course with no stored layouts one implicit main layout named after the course", () => {
    const ls = layoutsFor(course, []);
    expect(ls).toHaveLength(1);
    expect(ls[0]).toMatchObject({ layoutId: MAIN_LAYOUT, name: "Nevin Park", holeCount: 18, par: 54 });
  });
  it("puts main first and the rest by popularity", () => {
    const ls = layoutsFor(course, [row("udisc-l2", "Pony", 13), row("udisc-l1", "Mane", 170), row(MAIN_LAYOUT, "Long", 300)]);
    expect(ls.map((l) => l.name)).toEqual(["Long", "Mane", "Pony"]);
  });
  it("synthesises a main layout called Main when only extra layouts are stored", () => {
    const ls = layoutsFor(course, [row("udisc-l2", "Pony", 13)]);
    expect(ls.map((l) => l.name)).toEqual(["Main", "Pony"]);
  });
});

describe("pickLayout", () => {
  const ls = layoutsFor(course, [row("udisc-l2", "Pony", 13)]);
  it("returns the requested layout", () => {
    expect(pickLayout(ls, "udisc-l2").name).toBe("Pony");
  });
  it("falls back to main for unknown or missing ids", () => {
    expect(pickLayout(ls, "nope").layoutId).toBe(MAIN_LAYOUT);
    expect(pickLayout(ls, null).layoutId).toBe(MAIN_LAYOUT);
  });
});

describe("round layout", () => {
  it("treats rounds from before layouts existed as main", () => {
    expect(roundLayoutId({})).toBe(MAIN_LAYOUT);
    expect(roundLayoutId({ layoutId: "" })).toBe(MAIN_LAYOUT);
    expect(roundLayoutId({ layoutId: "udisc-l2" })).toBe("udisc-l2");
  });
});

describe("length bins", () => {
  it("labels UDisc bins and ignores unknown ones", () => {
    expect(formatLengthBin("short")).toBe("Short");
    expect(formatLengthBin("very-long")).toBe("Very long");
    expect(formatLengthBin("weird")).toBeNull();
    expect(formatLengthBin(null)).toBeNull();
  });
});
