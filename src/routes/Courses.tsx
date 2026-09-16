import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { LocateFixed, Search, Plus, MapPinOff, RefreshCw } from "lucide-react";
import { useGeolocation } from "@/services/useGeolocation";
import { fetchNearbyCourses } from "@/services/overpass";
import { searchPlace, type Place } from "@/services/nominatim";
import type { NearbyCourse } from "@/domain/osm";
import type { LatLon } from "@/domain/types";
import { formatDistance, haversineM, type Units } from "@/domain/geo";
import { upsertCourse, getSetting, setSetting } from "@/db/repo";
import { useCourses, useSetting } from "@/db/hooks";
import { Button, Chip, EmptyState, Field, IconButton, PageHeader, Segmented, Spinner } from "@/components/ui";
import { PinMap } from "@/map/CourseMap";

const RADII = [
  { km: 10, label: "10 km" },
  { km: 25, label: "25 km" },
  { km: 50, label: "50 km" },
  { km: 100, label: "100 km" },
];

export function CoursesRoute() {
  const nav = useNavigate();
  const geo = useGeolocation(false);
  const units = useSetting<Units>("units", "ft");
  const savedCourses = useCourses();
  const [radiusKm, setRadiusKm] = useState(25);
  const [view, setView] = useState<"list" | "map">("list");
  const [origin, setOrigin] = useState<(LatLon & { label?: string }) | null>(null);
  const [courses, setCourses] = useState<NearbyCourse[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [query, setQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<Place[] | null>(null);
  const [placeBusy, setPlaceBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const requested = useRef(false);

  // Restore last origin so the list is instant on return.
  useEffect(() => {
    getSetting<(LatLon & { label?: string }) | null>("lastOrigin", null).then((o) => {
      if (o && !origin) setOrigin(o);
    });
    getSetting<number>("radiusKm", 25).then(setRadiusKm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the device position arrives, use it as origin.
  useEffect(() => {
    if (geo.position) {
      const o = { lat: geo.position.lat, lon: geo.position.lon };
      setOrigin(o);
      setSetting("lastOrigin", o);
    }
  }, [geo.position]);

  // Auto-request location once if permission was already granted.
  useEffect(() => {
    if (geo.permission === "granted" && !requested.current) {
      requested.current = true;
      geo.locate();
    }
  }, [geo.permission, geo]);

  const load = useCallback(
    async (force = false) => {
      if (!origin) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      try {
        const res = await fetchNearbyCourses(origin, radiusKm * 1000, { force, signal: controller.signal });
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
    [origin, radiusKm],
  );

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const merged = useMemo(() => {
    // Combine live results with saved custom courses near the origin.
    const list: NearbyCourse[] = [...(courses ?? [])];
    for (const c of savedCourses) {
      if (c.source !== "custom") continue;
      const d = origin ? haversineM(origin, c) : undefined;
      if (d === undefined || d <= radiusKm * 1000) list.push({ ...c, distanceM: d });
    }
    const q = query.trim().toLowerCase();
    const filtered = q ? list.filter((c) => c.name.toLowerCase().includes(q) || c.city?.toLowerCase().includes(q)) : list;
    return filtered.sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
  }, [courses, savedCourses, origin, radiusKm, query]);

  async function open(course: NearbyCourse) {
    const saved = await upsertCourse({ ...course, distanceM: undefined } as NearbyCourse);
    nav(`/courses/${saved.id}`);
  }

  async function runPlaceSearch() {
    const text = query.trim();
    if (!text) return;
    setPlaceBusy(true);
    try {
      setPlaceResults(await searchPlace(text));
    } catch {
      setPlaceResults([]);
    } finally {
      setPlaceBusy(false);
    }
  }

  function choosePlace(p: Place) {
    const o = { lat: p.lat, lon: p.lon, label: p.label.split(",")[0] };
    setOrigin(o);
    setSetting("lastOrigin", o);
    setPlaceResults(null);
    setQuery("");
  }

  function changeRadius(km: number) {
    setRadiusKm(km);
    setSetting("radiusKm", km);
  }

  return (
    <div>
      <PageHeader
        title="Courses"
        sub={origin ? (origin.label ? `Near ${origin.label}` : "Near your location") : "Location needed"}
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
            runPlaceSearch();
          }}
          className="relative"
        >
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <Field name="q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter courses or search a place" className="pl-10 pr-24" aria-label="Search" />
          <button type="submit" disabled={!query.trim() || placeBusy} className="absolute right-2 top-1/2 h-8 -translate-y-1/2 rounded-full bg-surface-2 px-3 text-xs font-semibold text-ink disabled:opacity-40">
            {placeBusy ? "…" : "Search place"}
          </button>
        </form>
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
        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {RADII.map((r) => (
            <Chip key={r.km} active={radiusKm === r.km} onClick={() => changeRadius(r.km)}>
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
      </div>

      {!origin ? (
        <EmptyState
          icon={<MapPinOff size={36} />}
          title="Where are you playing?"
          body={geo.error ?? "Use your location to see courses around you, or search for a city above."}
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
            radiusM={radiusKm * 1000}
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
          {error && (
            <div className="mb-3 rounded-card bg-danger/10 px-4 py-3 text-sm text-ink">
              {courses && courses.length > 0 ? "Showing saved results. " : ""}
              {error}
              <button className="ml-2 font-semibold text-birdie" onClick={() => load(true)}>
                Retry
              </button>
            </div>
          )}
          {loading && !courses && (
            <div className="grid place-items-center py-10">
              <Spinner />
              <div className="mt-3 text-sm text-ink-3">Searching OpenStreetMap…</div>
            </div>
          )}
          {courses && merged.length === 0 && !loading && (
            <EmptyState
              title="No courses found"
              body={`Nothing within ${radiusKm} km on OpenStreetMap. Widen the search or add the course yourself.`}
              action={
                <Button variant="brand" onClick={() => nav("/courses/new")}>
                  <Plus size={18} /> Add a course
                </Button>
              }
            />
          )}
          {merged.length > 0 && (
            <div className="overflow-hidden rounded-card bg-surface shadow-card">
              {merged.map((c) => (
                <button key={c.id} onClick={() => open(c)} className="flex w-full items-center gap-3 border-b hairline px-4 py-3 text-left last:border-b-0 active:bg-surface-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{c.name}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-ink-3">
                      <span>{c.holeCount} holes</span>
                      {c.par && <span>par {c.par}</span>}
                      {c.city && <span>{c.city}</span>}
                      {c.fee === "yes" && <span>pay to play</span>}
                      {c.access === "private" || c.access === "permit" ? <span>restricted</span> : null}
                      {c.source === "custom" && <span>your course</span>}
                      {c.region && <span>{c.region}</span>}
                    </div>
                  </div>
                  {c.distanceM !== undefined && <div className="numeric text-sm font-semibold text-ink-2">{formatDistance(c.distanceM, units)}</div>}
                </button>
              ))}
            </div>
          )}
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
