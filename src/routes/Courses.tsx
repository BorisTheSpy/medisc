import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { LocateFixed, Search, Plus, MapPinOff, RefreshCw, MapPin, X } from "lucide-react";
import { useGeolocation } from "@/services/useGeolocation";
import { fetchNearbyCourses, searchCoursesByName } from "@/services/overpass";
import { searchPlace, type Place } from "@/services/nominatim";
import type { NearbyCourse } from "@/domain/osm";
import type { LatLon } from "@/domain/types";
import { formatTravelDistance, haversineM, type Units } from "@/domain/geo";
import { upsertCourse, getSetting, setSetting } from "@/db/repo";
import { useCourses, useSetting } from "@/db/hooks";
import { Button, Chip, EmptyState, Field, IconButton, PageHeader, Segmented, Spinner } from "@/components/ui";
import { PinMap } from "@/map/CourseMap";

const RADII = [
  { mi: 10, label: "10 mi" },
  { mi: 25, label: "25 mi" },
  { mi: 50, label: "50 mi" },
  { mi: 100, label: "100 mi" },
];
const MILE = 1609.344;

type Origin = LatLon & { label?: string; fromDevice?: boolean };

export function CoursesRoute() {
  const nav = useNavigate();
  const geo = useGeolocation(false);
  const units = useSetting<Units>("units", "ft");
  const savedCourses = useCourses();
  const [radiusMi, setRadiusMi] = useState(25);
  const [view, setView] = useState<"list" | "map">("list");
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [courses, setCourses] = useState<NearbyCourse[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NearbyCourse[] | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [placeResults, setPlaceResults] = useState<Place[] | null>(null);
  const [placeBusy, setPlaceBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const searchAbort = useRef<AbortController | null>(null);
  const requested = useRef(false);

  // Restore the last origin so the list is instant on return, then ask the device for a fresh fix.
  useEffect(() => {
    getSetting<Origin | null>("lastOrigin", null).then((o) => {
      if (o) setOrigin((cur) => cur ?? o);
    });
    getSetting<number>("radiusMi", 25).then(setRadiusMi);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!requested.current && geo.supported && geo.permission !== "denied") {
      requested.current = true;
      geo.locate();
    }
  }, [geo.supported, geo.permission, geo]);

  useEffect(() => {
    if (geo.position) {
      const o: Origin = { lat: geo.position.lat, lon: geo.position.lon, fromDevice: true };
      setOrigin((cur) => (cur && cur.fromDevice && haversineM(cur, o) < 200 ? cur : o));
      setSetting("lastOrigin", o);
    }
  }, [geo.position]);

  const load = useCallback(
    async (force = false) => {
      if (!origin) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      if (!force) setCourses(null);
      try {
        const res = await fetchNearbyCourses(origin, radiusMi * MILE, { force, signal: controller.signal });
        setCourses(res.courses);
        setFromCache(res.fromCache);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Could not load courses");
        setCourses((c) => c ?? []);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [origin, radiusMi],
  );

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const merged = useMemo(() => {
    const list: NearbyCourse[] = [...(courses ?? [])];
    for (const c of savedCourses) {
      if (c.source !== "custom") continue;
      const d = origin ? haversineM(origin, c) : undefined;
      if (d === undefined || d <= radiusMi * MILE) list.push({ ...c, distanceM: d });
    }
    const q = query.trim().toLowerCase();
    const filtered = q ? list.filter((c) => c.name.toLowerCase().includes(q) || c.city?.toLowerCase().includes(q)) : list;
    return filtered.sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
  }, [courses, savedCourses, origin, radiusMi, query]);

  async function open(course: NearbyCourse) {
    const saved = await upsertCourse({ ...course, distanceM: undefined } as NearbyCourse);
    nav(`/courses/${saved.id}`);
  }

  async function runCourseSearch() {
    const text = query.trim();
    if (!text) return;
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setSearchBusy(true);
    setPlaceResults(null);
    try {
      await searchCoursesByName(
        text,
        origin,
        (results) => {
          if (!controller.signal.aborted) {
            setSearchResults(results);
            setSearchBusy(false);
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
    const o: Origin = { lat: p.lat, lon: p.lon, label: p.label.split(",")[0] };
    setOrigin(o);
    setSetting("lastOrigin", o);
    setPlaceResults(null);
    setQuery("");
  }

  function clearSearch() {
    setQuery("");
    setSearchResults(null);
    setPlaceResults(null);
    searchAbort.current?.abort();
    setSearchBusy(false);
  }

  function changeRadius(mi: number) {
    setRadiusMi(mi);
    setSetting("radiusMi", mi);
  }

  const showingSearch = searchResults !== null;

  return (
    <div>
      <PageHeader
        title="Courses"
        sub={origin ? (origin.label ? `Near ${origin.label}` : origin.fromDevice ? "Near you" : "Near your last location") : geo.loading ? "Finding your location…" : "Location needed"}
        right={
          <>
            <IconButton label="Refresh" onClick={() => load(true)} disabled={!origin || loading}>
              <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
            </IconButton>
            <IconButton label="Use my location" onClick={geo.locate} disabled={geo.loading}>
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
        {!showingSearch && (
          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {RADII.map((r) => (
              <Chip key={r.mi} active={radiusMi === r.mi} onClick={() => changeRadius(r.mi)}>
                {r.label}
              </Chip>
            ))}
            <div className="flex-1" />
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

      {showingSearch ? (
        <div className="mt-3 px-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink-2">
              {searchResults.length} {searchResults.length === 1 ? "match" : "matches"} across the US
            </h2>
            <button className="text-sm font-semibold text-birdie" onClick={clearSearch}>
              Back to nearby
            </button>
          </div>
          {searchResults.length === 0 ? (
            <EmptyState
              title="No course by that name"
              body="Try a shorter name or the park it is in. If it is brand new, add it yourself."
              action={
                <Button variant="brand" onClick={() => nav("/courses/new")}>
                  <Plus size={18} /> Add a course
                </Button>
              }
            />
          ) : (
            <CourseList courses={searchResults} units={units} onOpen={open} />
          )}
        </div>
      ) : !origin ? (
        <EmptyState
          icon={<MapPinOff size={36} />}
          title={geo.loading ? "Finding your location" : "Where are you playing?"}
          body={geo.error ?? "Allow location access to see courses around you, or type a course name or city above."}
          action={
            <Button variant="brand" onClick={geo.locate} disabled={geo.loading}>
              {geo.loading ? <Spinner /> : <LocateFixed size={18} />} Use my location
            </Button>
          }
        />
      ) : view === "map" ? (
        <div className="mt-3 px-4">
          <PinMap
            center={origin}
            radiusM={radiusMi * MILE}
            user={geo.position}
            pins={merged.map((c) => ({ id: c.id, lat: c.lat, lon: c.lon, label: c.name }))}
            onPinClick={(id) => {
              const c = merged.find((x) => x.id === id);
              if (c) open(c);
            }}
            className="h-[60dvh] rounded-card shadow-card"
          />
        </div>
      ) : (
        <div className="mt-3 px-4">
          {geo.error && !origin.fromDevice && <div className="mb-3 rounded-card bg-surface-2 px-4 py-3 text-sm text-ink-2">{geo.error}</div>}
          {error && (
            <div className="mb-3 rounded-card bg-danger/10 px-4 py-3 text-sm text-ink">
              {courses && courses.length > 0 ? "Some sources did not answer. " : ""}
              {error}
              <button className="ml-2 font-semibold text-birdie" onClick={() => load(true)}>
                Retry
              </button>
            </div>
          )}
          {loading && !courses && (
            <div className="grid place-items-center py-10">
              <Spinner />
              <div className="mt-3 text-sm text-ink-3">Looking for courses within {radiusMi} miles…</div>
            </div>
          )}
          {courses && merged.length === 0 && !loading && (
            <EmptyState
              title={query.trim() ? `Nothing nearby matches “${query.trim()}”` : "No courses found"}
              body={query.trim() ? "Tap Find course to search the whole country, or clear the filter." : `Nothing within ${radiusMi} miles. Widen the search or add the course yourself.`}
              action={
                query.trim() ? (
                  <Button variant="brand" onClick={runCourseSearch}>
                    <Search size={18} /> Find course
                  </Button>
                ) : (
                  <Button variant="brand" onClick={() => nav("/courses/new")}>
                    <Plus size={18} /> Add a course
                  </Button>
                )
              }
            />
          )}
          {merged.length > 0 && <CourseList courses={merged} units={units} onOpen={open} />}
          {courses && (
            <p className="mt-3 text-center text-[11px] text-ink-3">
              {fromCache ? "From your last search. " : ""}Course data © OpenStreetMap contributors. Course data supplied by DiscGolfAPI.
            </p>
          )}
        </div>
      )}

      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-20 flex justify-center px-4" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
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
