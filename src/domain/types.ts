export type Zone = "fairway" | "off_fairway" | "c2" | "c1" | "parked" | "ob" | "basket";

export interface Timestamps {
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface Player extends Timestamps {
  id: string;
  name: string;
  color: string;
  isMe: boolean;
  lastPlayedAt?: number;
}

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Course extends Timestamps {
  id: string;
  source: "osm" | "custom" | "dga";
  dgaId?: string;
  region?: string;
  osmType?: "node" | "way" | "relation";
  osmId?: number;
  name: string;
  lat: number;
  lon: number;
  holeCount: number;
  par?: number;
  city?: string;
  fee?: string;
  access?: string;
  website?: string;
  tags?: Record<string, string>;
  fetchedHolesAt?: number;
}

export interface Hole {
  id: string;
  courseId: string;
  number: number;
  par: number;
  distanceM?: number;
  tee?: LatLon;
  basket?: LatLon;
  path?: LatLon[];
  name?: string;
  updatedAt: number;
}

export interface Round extends Timestamps {
  id: string;
  courseId: string;
  courseName: string;
  startedAt: number;
  finishedAt?: number;
  playerIds: string[];
  holeNumbers: number[];
  startingHole: number;
  trackThrows: boolean;
  name?: string;
  notes?: string;
}

export interface HoleScore {
  id: string;
  roundId: string;
  playerId: string;
  holeNumber: number;
  par: number;
  strokes: number;
  penalties: number;
  throws?: Zone[];
  updatedAt: number;
}

export interface Setting {
  key: string;
  value: unknown;
}

export interface OverpassCacheEntry {
  key: string;
  fetchedAt: number;
  json: unknown;
}
