import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { LocateFixed, Search, Plus, MapPinOff, RefreshCw, MapPin, X, Play, Info } from "lucide-react";
import { useGeolocation } from "@/services/useGeolocation";
import { fetchNearbyCourses, searchCoursesByName } from "@/services/overpass";
import { searchPlace, type Place } from "@/services/nominatim";
import { mergeCourseLists, type NearbyCourse } from "@/domain/osm";
import type { LatLon } from "@/domain/types";
import { formatTravelDistance, haversineM, type Units } from "@/domain/geo";
import { upsertCourse, getSetting, setSetting } from "@/db/repo";
import { useCourses, useSetting } from "@/db/hooks";
import { Button, EmptyState, Field, IconButton, PageHeader, Segmented, Spinner, cx } from "@/components/ui";
import { PinMap } from "@/map/CourseMap";

const MILE = 1609.344;
const DEFAULT_RADIUS_M = 10 * MILE;
const MAX_RADIUS_M = 100 * MILE;

/** The circle currently being searched: the map viewport, or a radius around you / a searched place. */
interface Area extends LatLon {
  radiusM: number;
  label?: string;
  fromDevice?: boolean;
}

export function CoursesRoute() {
  const nav = useNavigate();
  const geo = useGeolocation(false);
  const units = useSetting<Units>("units", "ft");
  const savedCourses = useCourses();
  const [view, setView] = useState<"list" | "map">("list");
  const [area, setArea] = useState<Area | null>(null);
  const [viewKey, setViewKey] = useState(0); // bump to move the map to `area`
  const [courses, setCourses] = useState<NearbyCourse[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NearbyCourse[] | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [placeResults, setPlaceResults] = useState<Place[] | null>(null);
  const [placeBusy, setPlaceBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placeFallback, setPlaceFallback] = useState<Place | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const searchAbort = useRef<AbortController | null>(null);
  const requested = useRef(false);
  const moveTimer = useRef<number | null>(null);

  // Restore the last area so the list is instant on return, then ask the device for a fresh fix.
  useEffect(() => {
    getSetting<Area | null>("lastArea", null).then((a) => {
      if (a) setArea((cur) => cur ?? { ...a, radiusM: Math.min(a.radiusM || DEFAULT_RADIUS_M, MAX_RADIUS_M) });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!requested.current && geo.supported && geo.permission !== "denied") {
      requested.current = true;
      geo.locate();
    }
  }, [geo.supported, geo.permission, geo]);

  /** Move the search area to the device position (first fix, or when the user taps locate). */
  const goToDevice = useCallback((pos: LatLon, force: boolean) => {
    setArea((cur) => {
      if (!force && cur?.fromDevice && haversineM(cur, pos) < 200) return cur;
      const next: Area = { lat: pos.lat, lon: pos.lon, radiusM: DEFAULT_RADIUS_M, fromDevice: true };
      setSetting("lastArea", next);
      return next;
    });
    setViewKey((k) => k + 1);
  }, []);

  const firstFix = useRef(true);
  useEffect(() => {
    if (!geo.position) return;
    // Only auto-move on the first fix; later fixes just update the dot so a panned map is not yanked back.
    if (firstFix.current) {
      firstFix.current = false;
      goToDevice(geo.position, false);
    }
  }, [geo.position, goToDevice]);

  const load = useCallback(async (target: Area, force = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    const keep = (list: NearbyCourse[] | null) => (list ?? []).filter((c) => haversineM(target, c) <= target.radiusM);
    const union = (prev: NearbyCourse[] | null, next: NearbyCourse[]) => mergeCourseLists(next, keep(prev));
    setCourses((prev) => (prev ? keep(prev) : prev));
    try {
      const res = await fetchNearbyCourses(target, target.radiusM, {
        force,
        signal: controller.signal,
        onUpdate: (partial) => {
          if (!controller.signal.aborted) setCourses((prev) => union(prev, partial));
        },
      });
      if (controller.signal.aborted) return;
      setCourses((prev) => union(prev, res.courses));
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Could not load courses");
      setCourses((c) => c ?? []);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (area) load(area);
    return () => abortRef.current?.abort();
  }, [area, load]);

  /** The map was panned or zoomed by the user: the viewport becomes the search area (debounced). */
  function onAreaChange(center: LatLon, radiusM: number) {
    if (moveTimer.current) window.clearTimeout(moveTimer.current);
    moveTimer.current = window.setTimeout(() => {
      const next: Area = { lat: center.lat, lon: center.lon, radiusM: Math.min(radiusM, MAX_RADIUS_M) };
      setArea(next);
      setSetting("lastArea", next);
    }, 500);
  }

  // Distance shown to the user is from their own position when known, otherwise from the area centre.
  const me: LatLon | null = geo.position ?? (area?.fromDevice ? area : null);
  const withDistance = useCallback(
    (list: NearbyCourse[]) => {
      const from = me ?? area;
      return list.map((c) => ({ ...c, distanceM: from ? haversineM(from, c) : c.distanceM }));
    },
    [me, area],
  );

  const merged = useMemo(() => {
    const list: NearbyCourse[] = [...(courses ?? [])];
    for (const c of savedCourses) {
      if (c.source !== "custom" || !area) continue;
      if (haversineM(area, c) <= area.radiusM && !list.some((x) => x.id === c.id)) list.push({ ...c });
    }
    return withDistance(list).sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
  }, [courses, savedCourses, area, withDistance]);

  async function open(course: NearbyCourse) {
    const saved = await upsertCourse({ ...course, distanceM: undefined } as NearbyCourse);
    nav(`/courses/${saved.id}`);
  }

  async function play(course: NearbyCourse) {
    const saved = await upsertCourse({ ...course, distanceM: undefined } as NearbyCourse);
    nav(`/play?course=${saved.id}`);
  }

  const selected = useMemo(() => merged.find((c) => c.id === selectedId) ?? null, [merged, selectedId]);

  async function runCourseSearch() {
    const text = query.trim();
    if (!text) return;
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setSearchBusy(true);
    setPlaceResults(null);
    setPlaceFallback(null);
    try {
      await searchCoursesByName(
        text,
        me ?? area,
        (results) => {
          if (controller.signal.aborted) return;
          setSearchResults(withDistance(results));
          setSearchBusy(false);
          if (results.length === 0) {
            searchPlace(text, controller.signal)
              .then((places) => {
                if (controller.signal.aborted) return;
                const origin = me ?? area;
                setPlaceFallback(places.find((p) => !origin || haversineM(origin, p) < 400_000) ?? null);
              })
              .catch(() => {});
          }
        },
        controller.signal,
      );
    } catch {
      if (!controller.signal.aborted) setSearchResults([]);
    } finally {
      if (!controller.signal.aborted) setSearchBusy(false);
    }
  }

  async function runPlaceSearch() {
    const text = query.trim();
    if (!text) return;
    setPlaceBusy(true);
    setSearchResults(null);
    try {
      setPlaceResults(await searchPlace(text));
    } catch {
      setPlaceResults([]);
    } finally {
      setPlaceBusy(false);
    }
  }

  function choosePlace(p: Place) {
    const next: Area = { lat: p.lat, lon: p.lon, radiusM: DEFAULT_RADIUS_M, label: p.label.split(",")[0] };
    setArea(next);
    setSetting("lastArea", next);
    setViewKey((k) => k + 1);
    setPlaceResults(null);
    setQuery("");
  }

  function clearSearch() {
    setQuery("");
    setSearchResults(null);
    setPlaceResults(null);
    setPlaceFallback(null);
    searchAbort.current?.abort();
    setSearchBusy(false);
  }

  function recenter() {
    if (geo.position) goToDevice(geo.position, true);
    geo.locate();
  }

  // Typing searches everywhere (directory, Google, OpenStreetMap) after a short pause, nearest first.
  const searchTimer = useRef<number | null>(null);
  const runCourseSearchRef = useRef(runCourseSearch);
  runCourseSearchRef.current = runCourseSearch;
  useEffect(() => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    const text = query.trim();
    if (text.length < 3) {
      if (text.length === 0) {
        setSearchResults(null);
        setPlaceFallback(null);
      }
      return;
    }
    searchTimer.current = window.setTimeout(() => runCourseSearchRef.current(), 600);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [query]);

  const showingSearch = searchResults !== null;
  const areaLabel = !area ? (geo.loading ? "Finding your location…" : "Location needed") : area.label ? `Near ${area.label}` : area.fromDevice ? "Near you" : "In the map area";
  const tooWide = !!area && area.radiusM >= MAX_RADIUS_M;

  return (
    <div>
      <PageHeader
        title="Courses"
        sub={areaLabel}
        right={
          <>
            <IconButton label="Refresh" onClick={() => area && load(area, true)} disabled={!area || loading}>
              <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
            </IconButton>
            <IconButton label="Go to my location" onClick={recenter}>
              <LocateFixed size={22} className={geo.loading ? "animate-pulse" : ""} />
            </IconButton>
          </>
        }
      />

      <div className="px-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runCourseSearch();
          }}
          className="relative"
        >
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <Field name="q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Course name, city or park" className="pl-10 pr-11" aria-label="Search courses" autoComplete="off" />
          {query && (
            <button type="button" aria-label="Clear search" onClick={clearSearch} className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-ink-3 hover:bg-surface-2">
              <X size={16} />
            </button>
          )}
        </form>
        {query.trim() && (
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="brand" onClick={runCourseSearch} disabled={searchBusy} className="flex-1">
              {searchBusy ? <Spinner className="h-4 w-4" /> : <Search size={14} />} Find course
            </Button>
            <Button size="sm" onClick={runPlaceSearch} disabled={placeBusy} className="flex-1">
              {placeBusy ? <Spinner className="h-4 w-4" /> : <MapPin size={14} />} Go to place
            </Button>
          </div>
        )}
        {placeResults && (
          <div className="mt-2 overflow-hidden rounded-card bg-surface shadow-card">
            {placeResults.length === 0 && <div className="px-4 py-3 text-sm text-ink-2">No places matched. Try a city or address.</div>}
            {placeResults.map((p) => (
              <button key={`${p.lat},${p.lon}`} onClick={() => choosePlace(p)} className="block w-full border-b hairline px-4 py-3 text-left text-sm last:border-b-0 active:bg-surface-2">
                {p.label}
              </button>
            ))}
          </div>
        )}
        {geo.error && (
          <div className="mt-3 rounded-card bg-surface-2 px-4 py-3 text-sm text-ink-2">
            {geo.error}
            <button className="ml-2 font-semibold text-birdie" onClick={geo.locate}>
              Try again
            </button>
          </div>
        )}
        {!showingSearch && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-xs text-ink-3">{area ? `${merged.length} ${merged.length === 1 ? "course" : "courses"} ${view === "map" ? "in view" : "in this area"}` : ""}</span>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: "list", label: "List" },
                { value: "map", label: "Map" },
              ]}
            />
          </div>
        )}
      </div>

      {showingSearch || searchBusy ? (
        <div className="mt-3 px-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink-2">
              {searchBusy && <Spinner className="h-3.5 w-3.5" />}
              {searchBusy ? "Searching…" : `${searchResults!.length} ${searchResults!.length === 1 ? "match" : "matches"} across the US`}
            </h2>
            <button className="text-sm font-semibold text-birdie" onClick={clearSearch}>
              Back to map area
            </button>
          </div>
          {searchBusy && !searchResults ? null : searchResults!.length === 0 ? (
            <EmptyState
              title="No course by that name"
              body={placeFallback ? `The directories do not list a course here yet, but the place exists: ${placeFallback.label.split(",").slice(0, 3).join(", ")}. Add it and set the holes yourself.` : "Try a shorter name or the park it is in. If it is brand new, add it yourself."}
              action={
                placeFallback ? (
                  <Button variant="primary" onClick={() => nav(`/courses/new?name=${encodeURIComponent(query.trim())}&lat=${placeFallback.lat}&lon=${placeFallback.lon}&city=${encodeURIComponent(placeFallback.city ?? "")}`)}>
                    <Plus size={18} /> Add course at {query.trim()}
                  </Button>
                ) : (
                  <Button variant="brand" onClick={() => nav("/courses/new")}>
                    <Plus size={18} /> Add a course
                  </Button>
                )
              }
            />
          ) : (
            <>
              <CourseList courses={searchResults!} units={units} onOpen={open} />
              {searchResults!.some((c) => c.source === "places") && <p className="mt-3 text-center text-[11px] text-ink-3">Powered by Google.</p>}
            </>
          )}
        </div>
      ) : !area ? (
        <EmptyState
          icon={<MapPinOff size={36} />}
          title={geo.loading ? "Finding your location" : "Where are you playing?"}
          body={geo.error ?? "Allow location access to see courses around you, or type a course name or city above."}
          action={
            <Button variant="brand" onClick={geo.locate}>
              {geo.loading ? <Spinner /> : <LocateFixed size={18} />} {geo.loading ? "Finding you… tap to retry" : "Use my location"}
            </Button>
          }
        />
      ) : view === "map" ? (
        <div className="mt-3 px-4">
          <PinMap
            center={area}
            radiusM={area.radiusM}
            viewKey={viewKey}
            user={geo.position}
            pins={merged.map((c) => ({ id: c.id, lat: c.lat, lon: c.lon, label: c.name, active: c.id === selectedId }))}
            onPinClick={(id) => setSelectedId((cur) => (cur === id ? null : id))}
            onAreaChange={onAreaChange}
            className="h-[66dvh] rounded-card shadow-card"
          >
            <button aria-label="Go to my location" onClick={recenter} className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-full bg-surface text-ink shadow-card">
              <LocateFixed size={18} />
            </button>
            {(loading || tooWide) && (
              <div className="absolute left-2 top-2 flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-xs font-medium shadow-card">
                {tooWide ? (
                  "Zoom in to see all courses"
                ) : (
                  <>
                    <Spinner className="h-3.5 w-3.5" /> Updating
                  </>
                )}
              </div>
            )}
            {selected && (
              <div className="absolute inset-x-2 bottom-8 rounded-card bg-surface p-3 shadow-card" role="dialog" aria-label={selected.name}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{selected.name}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-ink-3">
                      <span>{selected.holeCount} holes</span>
                      {selected.par && <span>par {selected.par}</span>}
                      {(selected.city || selected.region) && <span>{[selected.city, selected.region].filter(Boolean).join(", ")}</span>}
                      {selected.distanceM !== undefined && <span>{formatTravelDistance(selected.distanceM, units)} away</span>}
                      {selected.fee === "yes" && <span>pay to play</span>}
                    </div>
                  </div>
                  <IconButton label="Close" onClick={() => setSelectedId(null)} className="-mr-2 -mt-2 h-8 w-8">
                    <X size={16} />
                  </IconButton>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => open(selected)} className="flex-1">
                    <Info size={14} /> Details
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => play(selected)} className="flex-1">
                    <Play size={14} fill="currentColor" /> Play here
                  </Button>
                </div>
              </div>
            )}
          </PinMap>
          <p className="mt-2 text-center text-[11px] text-ink-3">
            Drag or zoom the map to search that area. Course data © OpenStreetMap contributors. Course data supplied by DiscGolfAPI.{merged.some((c) => c.source === "places") ? " Powered by Google." : ""}
          </p>
        </div>
      ) : (
        <div className="mt-3 px-4">
          {error && (
            <div className="mb-3 rounded-card bg-danger/10 px-4 py-3 text-sm text-ink">
              {courses && courses.length > 0 ? "Some sources did not answer. " : ""}
              {error}
              <button className="ml-2 font-semibold text-birdie" onClick={() => load(area, true)}>
                Retry
              </button>
            </div>
          )}
          {loading && courses && courses.length > 0 && (
            <div className="mb-2 flex items-center gap-2 text-xs text-ink-3">
              <Spinner className="h-3.5 w-3.5" /> Checking OpenStreetMap for more…
            </div>
          )}
          {loading && !courses && (
            <div className="grid place-items-center py-10">
              <Spinner />
              <div className="mt-3 text-sm text-ink-3">Looking for courses…</div>
            </div>
          )}
          {courses && merged.length === 0 && !loading && (
            <EmptyState
              title="No courses in this area"
              body="Open the map and drag to another area, type a course name, or add the course yourself."
              action={
                <Button variant="brand" onClick={() => setView("map")}>
                  <MapPin size={18} /> Open the map
                </Button>
              }
            />
          )}
          {merged.length > 0 && <CourseList courses={merged} units={units} onOpen={open} />}
          {courses && (
            <p className="mt-3 text-center text-[11px] text-ink-3">
              Course data © OpenStreetMap contributors. Course data supplied by DiscGolfAPI.{merged.some((c) => c.source === "places") ? " Powered by Google." : ""}
            </p>
          )}
        </div>
      )}

      <div className={cx("pointer-events-none fixed inset-x-0 bottom-20 z-20 flex justify-center px-4", view === "map" && !showingSearch && "hidden")} style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex w-full max-w-[448px] justify-end">
          <button onClick={() => nav("/courses/new")} className="pointer-events-auto flex h-14 items-center gap-2 rounded-full bg-accent px-5 font-bold text-accent-ink shadow-card">
            <Plus size={20} /> Add course
          </button>
        </div>
      </div>
    </div>
  );
}

function CourseList({ courses, units, onOpen }: { courses: NearbyCourse[]; units: Units; onOpen: (c: NearbyCourse) => void }) {
  return (
    <div className="overflow-hidden rounded-card bg-surface shadow-card">
      {courses.map((c) => (
        <button key={c.id} onClick={() => onOpen(c)} className="flex w-full items-center gap-3 border-b hairline px-4 py-3 text-left last:border-b-0 active:bg-surface-2">
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{c.name}</div>
            <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-ink-3">
              <span>{c.holeCount} holes</span>
              {c.par && <span>par {c.par}</span>}
              {(c.city || c.region) && <span>{[c.city, c.region].filter(Boolean).join(", ")}</span>}
              {c.fee === "yes" && <span>pay to play</span>}
              {c.access === "private" || c.access === "permit" ? <span>restricted</span> : null}
              {c.source === "custom" && <span>your course</span>}
            </div>
          </div>
          {c.distanceM !== undefined && <div className="numeric shrink-0 text-sm font-semibold text-ink-2">{formatTravelDistance(c.distanceM, units)}</div>}
        </button>
      ))}
    </div>
  );
}
