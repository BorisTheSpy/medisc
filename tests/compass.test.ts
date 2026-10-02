import { describe, it, expect } from "vitest";
import { headingFromOrientation, normalize, smoothHeading } from "../src/domain/compass";

describe("compass", () => {
  it("prefers the iOS compass heading", () => {
    expect(headingFromOrientation({ webkitCompassHeading: 45, alpha: 10, absolute: true })).toBe(45);
  });

  it("derives a heading from an absolute alpha", () => {
    expect(headingFromOrientation({ alpha: 90, absolute: true })).toBe(270);
    expect(headingFromOrientation({ alpha: 0, absolute: true })).toBe(0);
  });

  it("gives nothing for a relative reading", () => {
    expect(headingFromOrientation({ alpha: 90, absolute: false })).toBeNull();
    expect(headingFromOrientation({})).toBeNull();
  });

  it("normalises into 0 to 360", () => {
    expect(normalize(-10)).toBe(350);
    expect(normalize(370)).toBe(10);
  });

  it("smooths across the north boundary the short way", () => {
    expect(smoothHeading(350, 10, 0.5)).toBe(0);
    expect(smoothHeading(10, 350, 0.5)).toBe(0);
    expect(smoothHeading(null, 123)).toBe(123);
  });
});
