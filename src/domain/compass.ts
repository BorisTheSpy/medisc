/** Pure helpers for turning device orientation events into a compass heading. */

export interface OrientationReading {
  /** iOS only: degrees clockwise from magnetic north. */
  webkitCompassHeading?: number | null;
  /** Standard: degrees counter-clockwise from the device's starting orientation (or north when absolute). */
  alpha?: number | null;
  absolute?: boolean;
}

/** Heading in degrees clockwise from north, or null when the reading cannot give one. */
export function headingFromOrientation(e: OrientationReading): number | null {
  if (typeof e.webkitCompassHeading === "number" && Number.isFinite(e.webkitCompassHeading)) return normalize(e.webkitCompassHeading);
  if (e.absolute && typeof e.alpha === "number" && Number.isFinite(e.alpha)) return normalize(360 - e.alpha);
  return null;
}

export function normalize(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** Shortest-path blend from `prev` towards `next`, so the arrow does not spin the long way round. */
export function smoothHeading(prev: number | null, next: number, factor = 0.35): number {
  if (prev === null) return next;
  let delta = next - prev;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return normalize(prev + delta * factor);
}
