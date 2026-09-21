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
  source: "osm" | "custom" | "dga" | "places" | "community";
  dgaId?: string;
  placeId?: string;
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
  /** Comma-separated difficulty bins (easy, intermediate, challenging, very-challenging). */
  difficulty?: string;
  /** Average player rating out of 5. */
  rating?: number;
}

/**
 * A named set of tees and baskets on a course ("Long", "Short", "Blue tees"). Every course has a
 * main layout; imported courses may have more. Holes belong to exactly one layout.
 */
export interface Layout {
  /** `${courseId}/${layoutId}` so one table holds every course's layouts. */
  id: string;
  courseId: string;
  /** Stable across devices and the shared database: "main", or "udisc-l<id>" for imports. */
  layoutId: string;
  name: string;
  holeCount: number;
  par?: number;
  /** Total length in metres. */
  distanceM?: number;
  /** UDisc difficulty bin for this layout: easy, intermediate, challenging, very-challenging. */
  difficulty?: string;
  /** UDisc technicality bin: open, mild, technical, highly-technical. */
  technicality?: string;
  /** UDisc length bin: short, intermediate, long, very-long. */
  lengthBin?: string;
  /** Rounds played on this layout in the last 30 days, per UDisc. */
  playCount?: number;
  updatedAt: number;
}

export interface Hole {
  id: string;
  courseId: string;
  layoutId: string;
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
  /** Layout played; missing on rounds from before layouts existed, meaning main. */
  layoutId?: string;
  layoutName?: string;
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
