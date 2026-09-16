import { describe, it, expect } from "vitest";
import nearby from "./fixtures/nearby-helsinki.json";
import holes from "./fixtures/holes-paloheina.json";
import { parseNearbyCourses, parseCourseHoles, nearbyQuery, courseHolesQuery, parseHoleCount, parseLengthM } from "../src/domain/osm";
import type { Course } from "../src/domain/types";

describe("osm nearby", () => {
  const courses = parseNearbyCourses(nearby, { lat: 60.17, lon: 24.94 });

  it("dedupes node/relation duplicates preferring relation then way", () => {
    const palo = courses.filter((c) => c.name.startsWith("Paloheinän"));
    expect(palo).toHaveLength(1);
    expect(palo[0].osmType).toBe("relation");
    expect(palo[0].osmId).toBe(19340787);
    const tali = courses.filter((c) => c.name.startsWith("Talin"));
    expect(tali).toHaveLength(1);
    expect(tali[0].osmType).toBe("way");
    expect(courses.length).toBeLessThan(nearby.elements.length);
  });

  it("extracts coordinates from lat/lon or center", () => {
    for (const c of courses) {
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lon)).toBe(true);
    }
  });

  it("parses hole count and par when tagged", () => {
    const palo = courses.find((c) => c.osmId === 19340787)!;
    expect(palo.holeCount).toBe(18);
    expect(palo.par).toBe(54);
    const malmi = courses.find((c) => c.osmId === 19882946)!;
    expect(malmi.holeCount).toBe(9);
    expect(malmi.par).toBe(28);
  });

  it("falls back to description hole count and default 18", () => {
    const santahamina = courses.find((c) => c.name.startsWith("Santahaminan"))!;
    expect(santahamina.holeCount).toBe(21);
    const munkki = courses.find((c) => c.name.startsWith("Munkkiniemen"))!;
    expect(munkki.holeCount).toBe(18);
  });

  it("sorts by distance from origin and carries fee/access/city", () => {
    for (let i = 1; i < courses.length; i++) {
      expect(courses[i].distanceM!).toBeGreaterThanOrEqual(courses[i - 1].distanceM!);
    }
    const grani = courses.find((c) => c.name.startsWith("Grani"))!;
    expect(grani.city).toBe("Kauniainen");
    const palo = courses.find((c) => c.osmId === 19340787)!;
    expect(palo.fee).toBe("no");
  });
});

describe("osm holes", () => {
  const parsed = parseCourseHoles(holes, "course-1");

  it("returns 18 holes sorted by number with tee and basket", () => {
    expect(parsed).toHaveLength(18);
    expect(parsed.map((h) => h.number)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    const h4 = parsed.find((h) => h.number === 4)!;
    expect(h4.par).toBe(3);
    expect(h4.tee).toEqual({ lat: 60.2530143, lon: 24.9128466 });
    expect(h4.basket).toEqual({ lat: 60.253369, lon: 24.9120378 });
    expect(h4.path!.length).toBeGreaterThanOrEqual(2);
  });

  it("computes distance from geometry when untagged", () => {
    const h4 = parsed.find((h) => h.number === 4)!;
    expect(h4.distanceM).toBeGreaterThan(50);
    expect(h4.distanceM).toBeLessThan(70);
  });
});

describe("osm helpers", () => {
  it("parses messy hole counts", () => {
    expect(parseHoleCount({ "disc_golf:course": "18_hole" })).toBe(18);
    expect(parseHoleCount({ "disc_golf:course": "9" })).toBe(9);
    expect(parseHoleCount({ "disc_golf:course": "18 hole" })).toBe(18);
    expect(parseHoleCount({ description: "21 väylää - 21 holes" })).toBe(21);
    expect(parseHoleCount({})).toBeUndefined();
  });

  it("parses lengths in metres and feet", () => {
    expect(parseLengthM("95")).toBe(95);
    expect(parseLengthM("302 ft")).toBeCloseTo(92.05, 1);
    expect(parseLengthM("120 m")).toBe(120);
    expect(parseLengthM("abc")).toBeUndefined();
  });

  it("builds queries", () => {
    expect(nearbyQuery({ lat: 60.17, lon: 24.94 }, 15000)).toContain('around:15000,60.17,24.94');
    const rel: Course = { id: "x", source: "osm", osmType: "relation", osmId: 19340787, name: "P", lat: 60.25, lon: 24.91, holeCount: 18, createdAt: 0, updatedAt: 0 };
    expect(courseHolesQuery(rel)).toContain("rel(19340787)");
    const node: Course = { ...rel, osmType: "node", osmId: 1 };
    expect(courseHolesQuery(node)).toContain("around:");
    const way: Course = { ...rel, osmType: "way", osmId: 40254405 };
    expect(courseHolesQuery(way)).toContain("way(40254405)");
  });
});
