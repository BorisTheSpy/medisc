import type { LatLon } from "@/domain/types";

export interface Place extends LatLon {
  label: string;
  /** Best guess at the town or city, skipping house numbers and postcodes. */
  city?: string;
}

function cityFrom(displayName: string): string | undefined {
  const parts = displayName
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && !/^\d[\d-]*$/.test(p));
  return parts[1];
}

export async function searchPlace(text: string, signal?: AbortSignal): Promise<Place[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", text);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  const data = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  return data.map((d) => ({
    label: d.display_name
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p && !/^\d[\d-]*$/.test(p))
      .join(", "),
    city: cityFrom(d.display_name),
    lat: Number(d.lat),
    lon: Number(d.lon),
  }));
}
