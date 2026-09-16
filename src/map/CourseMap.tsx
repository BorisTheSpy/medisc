import { useEffect, useRef, useState, type ReactNode } from "react";
import { setWorkerUrl, Map as MLMap, Marker, LngLatBounds, type StyleSpecification, type GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { Crosshair, Layers } from "lucide-react";
import type { Hole, LatLon } from "@/domain/types";
import { cx } from "@/components/ui";

setWorkerUrl(workerUrl);

export const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
const SATELLITE_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SATELLITE_ATTRIBUTION = "Imagery © Esri, Maxar, Earthstar Geographics";

export const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    satellite: { type: "raster", tiles: [SATELLITE_TILES], tileSize: 256, maxzoom: 19, attribution: SATELLITE_ATTRIBUTION },
  },
  layers: [{ id: "satellite", type: "raster", source: "satellite" }],
};

export interface UserPosition extends LatLon {
  accuracy?: number;
}

export interface CourseMapProps {
  center: LatLon;
  holes?: Hole[];
  activeHole?: number;
  user?: UserPosition | null;
  satellite?: boolean;
  onSatelliteChange?: (v: boolean) => void;
  onMapClick?: (p: LatLon) => void;
  onHoleClick?: (n: number) => void;
  className?: string;
  fitOn?: "holes" | "active" | "none";
  interactive?: boolean;
  children?: ReactNode;
  zoom?: number;
}

function firstSymbolLayer(map: MLMap): string | undefined {
  return map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
}

function applySatellite(map: MLMap, on: boolean, fallback: boolean) {
  if (fallback) return; // fallback style is satellite-only already
  if (!map.getSource("satellite")) {
    map.addSource("satellite", { type: "raster", tiles: [SATELLITE_TILES], tileSize: 256, maxzoom: 19, attribution: SATELLITE_ATTRIBUTION });
  }
  if (!map.getLayer("satellite")) {
    map.addLayer({ id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" } }, firstSymbolLayer(map));
  }
  map.setLayoutProperty("satellite", "visibility", on ? "visible" : "none");
}

function holesGeoJSON(holes: Hole[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: holes
      .filter((h) => h.tee && h.basket)
      .map((h) => ({
        type: "Feature",
        properties: { number: h.number },
        geometry: {
          type: "LineString",
          coordinates: (h.path && h.path.length >= 2 ? h.path : [h.tee!, h.basket!]).map((p) => [p.lon, p.lat]),
        },
      })),
  };
}

const ACTIVE = "#E9A83A";
const LINE = "#1B3F7A";

function lineColor(active?: number) {
  return ["case", ["==", ["get", "number"], active ?? -1], ACTIVE, LINE] as unknown as string;
}
function lineWidth(active?: number, casing = false) {
  const base = casing ? 5.5 : 3;
  return ["case", ["==", ["get", "number"], active ?? -1], base + 1.5, base] as unknown as number;
}

function ensureHoleLayers(map: MLMap, holes: Hole[], active?: number) {
  const data = holesGeoJSON(holes);
  const src = map.getSource("holes") as GeoJSONSource | undefined;
  if (src) src.setData(data);
  else map.addSource("holes", { type: "geojson", data });
  if (!map.getLayer("holes-casing")) {
    map.addLayer({
      id: "holes-casing",
      type: "line",
      source: "holes",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#FFFFFF", "line-width": lineWidth(active, true), "line-opacity": 0.9 },
    });
    map.addLayer({
      id: "holes-line",
      type: "line",
      source: "holes",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": lineColor(active), "line-width": lineWidth(active), "line-dasharray": [2, 1.5] },
    });
  } else {
    map.setPaintProperty("holes-casing", "line-width", lineWidth(active, true));
    map.setPaintProperty("holes-line", "line-color", lineColor(active));
    map.setPaintProperty("holes-line", "line-width", lineWidth(active));
  }
}

export function CourseMap({ center, holes = [], activeHole, user, satellite = false, onSatelliteChange, onMapClick, onHoleClick, className, fitOn = "holes", interactive = true, children, zoom }: CourseMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const userRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const styleFailed = useRef(false);
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const onHoleClickRef = useRef(onHoleClick);
  onHoleClickRef.current = onHoleClick;

  useEffect(() => {
    if (!containerRef.current) return;
    let map: MLMap;
    try {
      map = new MLMap({
        container: containerRef.current,
        style: BASEMAP_STYLE,
        center: [center.lon, center.lat],
        zoom: zoom ?? 15,
        attributionControl: { compact: true },
        interactive,
        pitchWithRotate: false,
        dragRotate: false,
      });
    } catch (err) {
      setFailed(err instanceof Error ? err.message : "Map could not start");
      return;
    }
    mapRef.current = map;
    (containerRef.current as HTMLDivElement & { __map?: MLMap }).__map = map;
    map.touchZoomRotate.disableRotation();
    let styleLoaded = false;
    map.on("error", (e) => {
      const msg = String(e.error?.message ?? "");
      const w = window as Window & { __mapErrors?: string[] };
      (w.__mapErrors ??= []).push(msg);
      // Only fall back if the style document itself failed, never for individual tiles.
      if (!styleFailed.current && !styleLoaded && /style/i.test(msg)) {
        styleFailed.current = true;
        map.setStyle(FALLBACK_STYLE);
      }
    });
    map.on("style.load", () => {
      styleLoaded = true;
      setReady((n) => n + 1);
    });
    map.on("click", (e) => onMapClickRef.current?.({ lat: e.lngLat.lat, lon: e.lngLat.lng }));
    return () => {
      map.remove();
      mapRef.current = null;
      setReady(0);
    };
    // Center changes are handled by fit logic; only mount once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    applySatellite(map, satellite, styleFailed.current);
  }, [satellite, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    ensureHoleLayers(map, holes, activeHole);
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];
    for (const h of holes) {
      if (h.tee) {
        const el = document.createElement("button");
        el.className = cx("hole-marker tee", h.number === activeHole && "active");
        el.textContent = String(h.number);
        el.setAttribute("aria-label", `Hole ${h.number} tee`);
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onHoleClickRef.current?.(h.number);
        });
        markersRef.current.push(new Marker({ element: el }).setLngLat([h.tee.lon, h.tee.lat]).addTo(map));
      }
      if (h.basket) {
        const el = document.createElement("div");
        el.className = cx("hole-marker basket", h.number === activeHole && "active");
        el.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/></svg>';
        el.setAttribute("aria-label", `Hole ${h.number} basket`);
        markersRef.current.push(new Marker({ element: el }).setLngLat([h.basket.lon, h.basket.lat]).addTo(map));
      }
    }
  }, [holes, activeHole, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!user) {
      userRef.current?.remove();
      userRef.current = null;
      return;
    }
    if (!userRef.current) {
      const el = document.createElement("div");
      el.className = "user-dot";
      userRef.current = new Marker({ element: el }).setLngLat([user.lon, user.lat]).addTo(map);
    } else {
      userRef.current.setLngLat([user.lon, user.lat]);
    }
  }, [user, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (fitOn === "none") return;
    const pts: LatLon[] = [];
    if (fitOn === "active" && activeHole !== undefined) {
      const h = holes.find((x) => x.number === activeHole);
      if (h?.tee) pts.push(h.tee);
      if (h?.basket) pts.push(h.basket);
      if (h?.path) pts.push(...h.path);
      if (user && h?.tee && h?.basket) {
        const d = Math.hypot(user.lat - h.tee.lat, user.lon - h.tee.lon);
        if (d < 0.01) pts.push(user);
      }
    } else {
      for (const h of holes) {
        if (h.tee) pts.push(h.tee);
        if (h.basket) pts.push(h.basket);
      }
    }
    if (pts.length === 0) {
      map.easeTo({ center: [center.lon, center.lat], zoom: zoom ?? 15, duration: 400 });
      return;
    }
    if (pts.length === 1) {
      map.easeTo({ center: [pts[0].lon, pts[0].lat], zoom: 17, duration: 400 });
      return;
    }
    const b = new LngLatBounds();
    for (const p of pts) b.extend([p.lon, p.lat]);
    map.fitBounds(b, { padding: fitOn === "active" ? 60 : 40, maxZoom: 18, duration: 500 });
  }, [fitOn, activeHole, holes, ready, center.lat, center.lon, zoom, user?.lat, user?.lon]);

  function recenter() {
    const map = mapRef.current;
    if (!map) return;
    if (user) map.easeTo({ center: [user.lon, user.lat], zoom: Math.max(map.getZoom(), 17) });
    else map.easeTo({ center: [center.lon, center.lat] });
  }

  if (failed) {
    return (
      <div className={cx("grid place-items-center rounded-card bg-surface-2 p-6 text-center text-sm text-ink-2", className)}>
        The map needs WebGL, which this browser does not provide. Hole list and scoring still work.
      </div>
    );
  }

  return (
    <div className={cx("relative overflow-hidden bg-surface-2", className)}>
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute right-2 top-2 flex flex-col gap-2">
        {onSatelliteChange && (
          <button
            aria-pressed={satellite}
            aria-label="Toggle satellite imagery"
            onClick={() => onSatelliteChange(!satellite)}
            className={cx("grid h-10 w-10 place-items-center rounded-full shadow-card", satellite ? "bg-accent text-accent-ink" : "bg-surface text-ink")}
          >
            <Layers size={18} />
          </button>
        )}
        <button aria-label="Center on me" onClick={recenter} className="grid h-10 w-10 place-items-center rounded-full bg-surface text-ink shadow-card">
          <Crosshair size={18} />
        </button>
      </div>
      {children}
    </div>
  );
}

export interface PinMapProps {
  center: LatLon;
  pins: { id: string; lat: number; lon: number; label: string; active?: boolean }[];
  user?: UserPosition | null;
  onPinClick?: (id: string) => void;
  className?: string;
  radiusM?: number;
}

/** Overview map with course pins. */
export function PinMap({ center, pins, user, onPinClick, className, radiusM }: PinMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const userRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const onPinClickRef = useRef(onPinClick);
  onPinClickRef.current = onPinClick;

  useEffect(() => {
    if (!containerRef.current) return;
    let map: MLMap;
    try {
      map = new MLMap({ container: containerRef.current, style: BASEMAP_STYLE, center: [center.lon, center.lat], zoom: 11, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false });
    } catch {
      setFailed(true);
      return;
    }
    mapRef.current = map;
    let styleFailed = false;
    let styleLoaded = false;
    map.on("error", (e) => {
      if (!styleFailed && !styleLoaded && /style/i.test(String(e.error?.message ?? ""))) {
        styleFailed = true;
        map.setStyle(FALLBACK_STYLE);
      }
    });
    map.on("style.load", () => {
      styleLoaded = true;
      setReady(true);
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];
    const b = new LngLatBounds();
    for (const p of pins) {
      const el = document.createElement("button");
      el.className = "course-pin";
      el.setAttribute("aria-label", p.label);
      el.title = p.label;
      el.addEventListener("click", () => onPinClickRef.current?.(p.id));
      markersRef.current.push(new Marker({ element: el, anchor: "bottom", offset: [0, 4] }).setLngLat([p.lon, p.lat]).addTo(map));
      b.extend([p.lon, p.lat]);
    }
    if (user) b.extend([user.lon, user.lat]);
    if (pins.length > 0) map.fitBounds(b, { padding: 50, maxZoom: 14, duration: 500 });
    else if (radiusM) map.easeTo({ center: [center.lon, center.lat], zoom: radiusM > 30000 ? 9 : radiusM > 15000 ? 10 : 11 });
  }, [pins, ready, user, center.lat, center.lon, radiusM]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !user) return;
    if (!userRef.current) {
      const el = document.createElement("div");
      el.className = "user-dot";
      userRef.current = new Marker({ element: el }).setLngLat([user.lon, user.lat]).addTo(map);
    } else userRef.current.setLngLat([user.lon, user.lat]);
  }, [user, ready]);

  if (failed) return <div className={cx("grid place-items-center bg-surface-2 p-6 text-sm text-ink-2", className)}>The map needs WebGL, which this browser does not provide.</div>;
  return (
    <div className={cx("relative overflow-hidden bg-surface-2", className)}>
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  );
}
