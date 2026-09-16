import type { LatLon } from "./types";

const R = 6371e3;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export type Units = "m" | "ft";

/** Great-circle distance in metres. */
export function haversineM(a: LatLon, b: LatLon): number {
  const p1 = toRad(a.lat);
  const p2 = toRad(b.lat);
  const dp = toRad(b.lat - a.lat);
  const dl = toRad(b.lon - a.lon);
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Initial bearing from a to b, 0..360 degrees clockwise from north. */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const p1 = toRad(a.lat);
  const p2 = toRad(b.lat);
  const dl = toRad(b.lon - a.lon);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function metresToFeet(m: number): number {
  return m * 3.28084;
}

export function metresToYards(m: number): number {
  return m * 1.09361;
}

/**
 * General distances. Imperial: feet up to 1000 ft, yards up to half a mile, then miles.
 */
export function formatDistance(metres: number, units: Units): string {
  if (units === "ft") {
    const ft = metresToFeet(metres);
    if (ft < 1000) return `${Math.round(ft)} ft`;
    if (ft < 2640) return `${Math.round(ft / 3)} yd`;
    return `${(ft / 5280).toFixed(1)} mi`;
  }
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)} km`;
  return `${Math.round(metres)} m`;
}

/** Hole lengths and distance to the basket: always feet in imperial, metres in metric. */
export function formatHoleDistance(metres: number, units: Units): string {
  if (units === "ft") return `${Math.round(metresToFeet(metres)).toLocaleString()} ft`;
  return `${Math.round(metres)} m`;
}

/** Course-to-you distances: miles (or km) with one decimal, feet under a quarter mile. */
export function formatTravelDistance(metres: number, units: Units): string {
  if (units === "ft") {
    const mi = metres / 1609.344;
    if (mi < 0.25) return `${Math.round(metresToFeet(metres))} ft`;
    if (mi >= 100) return `${Math.round(mi).toLocaleString()} mi`;
    return `${mi.toFixed(1)} mi`;
  }
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

export function unitLabel(units: Units): string {
  return units === "ft" ? "ft" : "m";
}

export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export function bbox(center: LatLon, radiusM: number): BBox {
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.max(Math.cos(toRad(center.lat)), 0.01));
  return {
    south: center.lat - dLat,
    north: center.lat + dLat,
    west: center.lon - dLon,
    east: center.lon + dLon,
  };
}

export function centroid(points: LatLon[]): LatLon | undefined {
  if (points.length === 0) return undefined;
  const sum = points.reduce((acc, p) => ({ lat: acc.lat + p.lat, lon: acc.lon + p.lon }), { lat: 0, lon: 0 });
  return { lat: sum.lat / points.length, lon: sum.lon / points.length };
}
