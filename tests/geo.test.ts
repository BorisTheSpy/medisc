import { describe, it, expect } from "vitest";
import { haversineM, bearingDeg, formatDistance, bbox } from "../src/domain/geo";

describe("geo", () => {
  it("haversine Helsinki to Tallinn is about 82 km", () => {
    const d = haversineM({ lat: 60.1699, lon: 24.9384 }, { lat: 59.437, lon: 24.7536 });
    expect(d).toBeGreaterThan(81_000);
    expect(d).toBeLessThan(83_000);
  });

  it("haversine of same point is 0", () => {
    expect(haversineM({ lat: 1, lon: 1 }, { lat: 1, lon: 1 })).toBe(0);
  });

  it("bearing due north is 0 and due east is 90", () => {
    expect(Math.round(bearingDeg({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }))).toBe(0);
    expect(Math.round(bearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }))).toBe(90);
  });

  it("formats metres and feet", () => {
    expect(formatDistance(95.4, "m")).toBe("95 m");
    expect(formatDistance(95.4, "ft")).toBe("313 ft");
    expect(formatDistance(12_345, "m")).toBe("12.3 km");
    expect(formatDistance(3_000, "ft")).toBe("1.9 mi");
  });

  it("bbox grows with radius", () => {
    const b = bbox({ lat: 60, lon: 25 }, 10_000);
    expect(b.south).toBeLessThan(60);
    expect(b.north).toBeGreaterThan(60);
    expect(b.west).toBeLessThan(25);
    expect(b.east).toBeGreaterThan(25);
  });
});
