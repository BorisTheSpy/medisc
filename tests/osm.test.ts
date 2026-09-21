import { describe, it, expect } from "vitest";
import nearbyJson from "./fixtures/nearby-helsinki.json";
import holesJson from "./fixtures/holes-paloheina.json";
const nearby = nearbyJson as unknown as OverpassResponse;
const holes = holesJson as unknown as OverpassResponse;
import { parseNearbyCourses, parseCourseHoles, nearbyQuery, courseHolesQuery, parseHoleCount, parseLengthM, mergeCourseLists, validatePlaces, dropHidden, type OverpassResponse, type NearbyCourse } from "../src/domain/osm";
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
    expect(parseHoleCount({ name: "Reedy Creek Disc Golf Course (Holes 1–9)" })).toBe(9);
    expect(parseHoleCount({ name: "Sugaw Creek 9 Hole" })).toBe(9);
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

const mk = (id: string, name: string, lat: number, lon: number, source: NearbyCourse["source"]): NearbyCourse =>
  ({ id, name, lat, lon, source, distanceM: 0, updatedAt: 0, tags: {} }) as NearbyCourse;

describe("mergeCourseLists keeps distinct courses in one park", () => {
  it("never merges two directory records into each other", () => {
    const a = mk("d1", "Nevin Park Disc Golf Course", 35.30, -80.85, "dga");
    const b = mk("d2", "Nevin Daydream", 35.304, -80.85, "dga");
    expect(mergeCourseLists([], [a, b]).map((c) => c.id)).toEqual(["d1", "d2"]);
  });
  it("lets one OSM entry absorb only one directory record", () => {
    const osm = mk("o1", "Reedy Creek Disc Golf Course", 35.30, -80.75, "osm");
    const short = mk("d1", "Reedy Creek Disc Golf Course (Holes 1–9)", 35.302, -80.75, "dga");
    const long = mk("d2", "Reedy Creek Park", 35.308, -80.75, "dga");
    const out = mergeCourseLists([osm], [short, long]);
    expect(out.map((c) => c.id).sort()).toEqual(["d2", "o1"]);
  });
  it("is stable when the same lists are merged again", () => {
    const dir = mk("d1", "Bradford Park", 35.5, -80.6, "dga");
    const gp = mk("gp-1", "Bradford Park Disc Golf Course", 35.5001, -80.6, "places");
    const once = mergeCourseLists([dir], [gp]);
    const twice = mergeCourseLists(once, [dir, gp]);
    expect(twice.map((c) => c.id)).toEqual(["d1"]);
  });
  it("keeps the base record's hole count when it absorbs a copy", () => {
    const shared = { ...mk("udisc-1", "Robert L. Smith: Ravine", 35.258, -80.943, "community"), holeCount: 20 };
    const dir = { ...mk("d1", "Robert L. Smith Park", 35.2581, -80.943, "dga"), holeCount: 18 };
    const out = mergeCourseLists([shared], [dir]);
    expect(out.length).toBe(1);
    expect(out[0]!.holeCount).toBe(20);
  });
  it("keeps a 9 and an 18 apart even when their names match", () => {
    const shared = { ...mk("udisc-1", "Reedy Creek DGC", 35.30, -80.75, "community"), holeCount: 18 };
    const osm = { ...mk("o1", "Reedy Creek Disc Golf Course (Holes 1–9)", 35.302, -80.75, "osm"), holeCount: 9 };
    expect(mergeCourseLists([shared], [osm]).map((c) => c.id).sort()).toEqual(["o1", "udisc-1"]);
  });
  it("tolerates a hole count off by one or two", () => {
    const shared = { ...mk("udisc-1", "Kilborne TPC", 35.22, -80.77, "community"), holeCount: 19 };
    const dir = { ...mk("d1", "Kilborne TPC", 35.2201, -80.77, "dga"), holeCount: 18 };
    expect(mergeCourseLists([shared], [dir]).map((c) => c.id)).toEqual(["udisc-1"]);
  });
  it("still folds a Places copy into the directory record", () => {
    const dir = mk("d1", "Bradford Park", 35.5, -80.6, "dga");
    const gp = mk("gp-1", "Bradford Park Disc Golf Course", 35.5001, -80.6, "places");
    expect(mergeCourseLists([], mergeCourseLists([dir], [gp])).map((c) => c.id)).toEqual(["d1"]);
  });
});

describe("validatePlaces", () => {
  const dir = mk("d1", "Elon Park - Eager Beaver", 35.02, -80.845, "dga");
  it("keeps a Google result whose name says disc golf", () => {
    const gp = mk("gp-1", "Blair Mill Disc Golf Course", 35.4, -80.7, "places");
    expect(validatePlaces([gp]).length).toBe(1);
  });
  it("drops a bare park with no course from another source nearby", () => {
    const gp = mk("gp-2", "Biddleville Park", 35.2429, -80.8502, "places");
    expect(validatePlaces([dir, gp]).map((c) => c.id)).toEqual(["d1"]);
  });
  it("keeps a bare park anchored by a same-named course within 1 km", () => {
    const gp = mk("gp-3", "Elon Homes Park", 35.0201, -80.8413, "places");
    expect(validatePlaces([dir, gp]).map((c) => c.id)).toEqual(["d1", "gp-3"]);
  });
});

describe("dropHidden", () => {
  it("removes reported places by key or by name near the report", () => {
    const a = mk("gp-x", "Biddleville Park", 35.2429, -80.8502, "places");
    const b = mk("osm-1", "Biddleville Park", 35.243, -80.8503, "osm");
    const c = mk("d1", "Chantilly Park", 35.21, -80.80, "dga");
    expect(dropHidden([a, b, c], [{ key: "gp-x", name: "Biddleville Park", lat: 35.2429, lon: -80.8502 }]).map((x) => x.id)).toEqual(["d1"]);
  });
});
