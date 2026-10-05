import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { setWorkerUrl, Map as MLMap, Marker, LngLatBounds, type StyleSpecification, type GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { Compass, Crosshair, Flag, Layers } from "lucide-react";
import type { Hole, LatLon } from "@/domain/types";
import { bearingDeg, haversineM } from "@/domain/geo";
import { useCompass } from "@/services/useCompass";
import { cx } from "@/components/ui";

setWorkerUrl(workerUrl);

export const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/dark";
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
  /** GPS course in degrees, only meaningful while moving. The compass sensor takes priority. */
  heading?: number | null;
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

const ACTIVE = "#ffb340";
const LINE = "#eef3fa";

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
      paint: { "line-color": "#0c1a2c", "line-width": lineWidth(active, true), "line-opacity": 0.85 },
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
  const userElRef = useRef<HTMLDivElement | null>(null);
  const compass = useCompass(user?.heading);
  /** True once the player pans or zooms by hand; the camera then stays put until the hole changes. */
  const [explored, setExplored] = useState(false);
  const exploredRef = useRef(false);
  const userPosRef = useRef(user);
  userPosRef.current = user;
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
    // Only gestures carry an originalEvent; our own easeTo and fitBounds calls do not.
    map.on("movestart", (e) => {
      if (!(e as { originalEvent?: unknown }).originalEvent || exploredRef.current) return;
      exploredRef.current = true;
      setExplored(true);
    });
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
        // A tee with a basket is a pad that points down the fairway; the number stays upright.
        const bearing = h.basket ? bearingDeg(h.tee, h.basket) : null;
        const wrap = document.createElement("div");
        wrap.className = "marker-wrap";
        const el = document.createElement("button");
        el.className = cx("hole-marker tee", bearing !== null && "pad", h.number === activeHole && "active");
        if (bearing !== null) {
          const fill = document.createElement("i");
          fill.className = "pad-fill";
          el.appendChild(fill);
        }
        const num = document.createElement("span");
        num.className = "pad-num";
        num.textContent = String(h.number);
        if (bearing !== null) num.style.transform = `rotate(${-bearing}deg)`;
        el.appendChild(num);
        el.setAttribute("aria-label", `Hole ${h.number} tee`);
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onHoleClickRef.current?.(h.number);
        });
        wrap.appendChild(el);
        const marker = new Marker({ element: wrap, rotationAlignment: "map", pitchAlignment: "map" }).setLngLat([h.tee.lon, h.tee.lat]);
        if (bearing !== null) marker.setRotation(bearing);
        markersRef.current.push(marker.addTo(map));
      }
      if (h.basket) {
        const wrap = document.createElement("div");
        wrap.className = "marker-wrap";
        const el = document.createElement("div");
        el.className = cx("hole-marker basket", h.number === activeHole && "active");
        el.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/></svg>';
        el.setAttribute("aria-label", `Hole ${h.number} basket`);
        wrap.appendChild(el);
        markersRef.current.push(new Marker({ element: wrap }).setLngLat([h.basket.lon, h.basket.lat]).addTo(map));
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
      el.className = "user-marker";
      el.innerHTML = '<i class="user-cone"></i><i class="user-dot"></i>';
      userElRef.current = el;
      userRef.current = new Marker({ element: el, rotationAlignment: "map", pitchAlignment: "map" }).setLngLat([user.lon, user.lat]).addTo(map);
    } else {
      userRef.current.setLngLat([user.lon, user.lat]);
    }
  }, [user, ready]);

  // The cone in front of the dot turns with the phone.
  useEffect(() => {
    const marker = userRef.current;
    const el = userElRef.current;
    if (!marker || !el) return;
    if (compass.heading === null) {
      el.classList.remove("has-heading");
      return;
    }
    el.classList.add("has-heading");
    marker.setRotation(compass.heading);
  }, [compass.heading, user, ready]);

  /**
   * What the camera should frame, as a string. GPS updates are deliberately not part of it, so a
   * walking player's position never yanks the view. It changes when the hole, its pins, or the
   * requested view change.
   */
  const fitKey = useMemo(() => {
    const pt = (p?: LatLon) => (p ? `${p.lat.toFixed(6)},${p.lon.toFixed(6)}` : "-");
    if (fitOn === "none") return `none|${center.lat}|${center.lon}|${zoom ?? ""}`;
    if (fitOn === "active") {
      const h = holes.find((x) => x.number === activeHole);
      return `active|${activeHole}|${pt(h?.tee)}|${pt(h?.basket)}|${(h?.path ?? []).map(pt).join(";")}|${center.lat}|${center.lon}`;
    }
    return `holes|${holes.map((h) => `${pt(h.tee)}>${pt(h.basket)}`).join(";")}|${center.lat}|${center.lon}`;
  }, [fitOn, activeHole, holes, center.lat, center.lon, zoom]);

  function fitView(animate = true) {
    const map = mapRef.current;
    if (!map) return;
    const duration = animate ? 450 : 0;
    if (fitOn === "none") {
      map.easeTo({ center: [center.lon, center.lat], zoom: zoom ?? map.getZoom(), duration });
      return;
    }
    const pts: LatLon[] = [];
    const me = userPosRef.current;
    if (fitOn === "active" && activeHole !== undefined) {
      const h = holes.find((x) => x.number === activeHole);
      if (h?.tee) pts.push(h.tee);
      if (h?.basket) pts.push(h.basket);
      if (h?.path) pts.push(...h.path);
      // Include the player only when they are actually around this hole.
      if (me && h?.tee && h?.basket && haversineM(me, h.tee) < 400) pts.push(me);
    } else {
      for (const h of holes) {
        if (h.tee) pts.push(h.tee);
        if (h.basket) pts.push(h.basket);
      }
    }
    if (pts.length === 0) {
      map.easeTo({ center: [center.lon, center.lat], zoom: zoom ?? 15, duration });
      return;
    }
    if (pts.length === 1) {
      map.easeTo({ center: [pts[0].lon, pts[0].lat], zoom: 17, duration });
      return;
    }
    const b = new LngLatBounds();
    for (const p of pts) b.extend([p.lon, p.lat]);
    map.fitBounds(b, { padding: fitOn === "active" ? 60 : 40, maxZoom: 18, duration });
  }

  function backToHole() {
    exploredRef.current = false;
    setExplored(false);
    fitView();
  }

  // A new hole (or new pins, or a new requested view) resets exploring and frames it.
  useEffect(() => {
    if (!mapRef.current || !ready) return;
    exploredRef.current = false;
    setExplored(false);
    fitView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, ready]);

  // The first GPS fix may bring the player into frame, unless they are already looking around.
  const hasFix = !!user;
  useEffect(() => {
    if (!hasFix || !mapRef.current || !ready || exploredRef.current || fitOn !== "active") return;
    fitView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFix]);

  function recenter() {
    const map = mapRef.current;
    if (!map) return;
    // Looking at yourself is still exploring: the camera should not snap back on the next fix.
    exploredRef.current = true;
    setExplored(true);
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
            className={cx("grid h-10 w-10 place-items-center rounded-full border border-line-strong", satellite ? "bg-live text-on-live" : "bg-surface text-ink")}
          >
            <Layers size={18} />
          </button>
        )}
        <button aria-label="Center on me" onClick={recenter} className="grid h-10 w-10 place-items-center rounded-full border border-line-strong bg-surface text-ink">
          <Crosshair size={18} />
        </button>
        {explored && fitOn !== "none" && (
          <button aria-label={fitOn === "active" && activeHole !== undefined ? `Back to hole ${activeHole}` : "Show all holes"} onClick={backToHole} className="grid h-10 w-10 place-items-center rounded-full border border-live bg-live text-on-live">
            <Flag size={18} />
          </button>
        )}
        {compass.supported && compass.needsPermission && (
          <button aria-label="Show which way I am facing" onClick={() => void compass.request()} className="grid h-10 w-10 place-items-center rounded-full border border-live bg-surface text-live">
            <Compass size={18} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export interface PinMapProps {
  /** Requested view. Applied whenever `viewKey` changes (locate, place search). */
  center: LatLon;
  radiusM: number;
  viewKey: number;
  pins: { id: string; lat: number; lon: number; label: string; active?: boolean }[];
  user?: UserPosition | null;
  onPinClick?: (id: string) => void;
  /** Fired after the user pans or zooms, with the circle that covers the viewport. */
  onAreaChange?: (center: LatLon, radiusM: number) => void;
  className?: string;
  children?: ReactNode;
}

function zoomForRadius(radiusM: number, lat: number, widthPx: number): number {
  // metres per pixel at zoom z: 156543.03 * cos(lat) / 2^z ; we want the radius to span half the width
  const mpp = (radiusM * 2) / Math.max(widthPx, 200);
  return Math.log2((156543.03 * Math.cos((lat * Math.PI) / 180)) / mpp);
}

/** Overview map with course pins. The visible area is the search area. */
export function PinMap({ center, radiusM, viewKey, pins, user, onPinClick, onAreaChange, className, children }: PinMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const userRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const onPinClickRef = useRef(onPinClick);
  onPinClickRef.current = onPinClick;
  const onAreaChangeRef = useRef(onAreaChange);
  onAreaChangeRef.current = onAreaChange;
  const appliedViewKey = useRef(-1);

  useEffect(() => {
    if (!containerRef.current) return;
    let map: MLMap;
    try {
      map = new MLMap({
        container: containerRef.current,
        style: BASEMAP_STYLE,
        center: [center.lon, center.lat],
        zoom: zoomForRadius(radiusM, center.lat, containerRef.current.clientWidth),
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
      });
    } catch {
      setFailed(true);
      return;
    }
    mapRef.current = map;
    (containerRef.current as HTMLDivElement & { __map?: MLMap }).__map = map;
    map.touchZoomRotate.disableRotation();
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
    map.on("moveend", (e) => {
      // Only user gestures count; programmatic moves (locate, place search) already know their area.
      if (!(e as { originalEvent?: unknown }).originalEvent) return;
      const c = map.getCenter();
      const ne = map.getBounds().getNorthEast();
      const r = haversineM({ lat: c.lat, lon: c.lng }, { lat: ne.lat, lon: ne.lng });
      onAreaChangeRef.current?.({ lat: c.lat, lon: c.lng }, r);
    });
    appliedViewKey.current = viewKey;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply an externally requested view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || appliedViewKey.current === viewKey) return;
    appliedViewKey.current = viewKey;
    map.easeTo({ center: [center.lon, center.lat], zoom: zoomForRadius(radiusM, center.lat, map.getContainer().clientWidth), duration: 600 });
  }, [viewKey, center.lat, center.lon, radiusM, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];
    for (const p of pins) {
      const el = document.createElement("button");
      el.className = cx("course-pin", p.active && "active");
      el.setAttribute("aria-label", p.label);
      el.title = p.label;
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onPinClickRef.current?.(p.id);
      });
      markersRef.current.push(new Marker({ element: el, anchor: "bottom", offset: [0, 4] }).setLngLat([p.lon, p.lat]).addTo(map));
    }
  }, [pins, ready]);

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
      {children}
    </div>
  );
}
