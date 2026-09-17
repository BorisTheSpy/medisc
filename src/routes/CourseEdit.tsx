import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { LocateFixed, Trash2, Plus } from "lucide-react";
import { useCourse, useHoles, useSetting } from "@/db/hooks";
import { createCustomCourse, getSetting, saveHoles, setSetting, updateHole } from "@/db/repo";
import { db } from "@/db/db";
import { useGeolocation } from "@/services/useGeolocation";
import { searchPlace, type Place } from "@/services/nominatim";
import { formatHoleDistance, haversineM, type Units } from "@/domain/geo";
import type { Hole, LatLon } from "@/domain/types";
import { Button, Field, PageHeader, Section, Spinner, cx } from "@/components/ui";
import { CourseMap } from "@/map/CourseMap";

export function CourseEditRoute() {
  const { id } = useParams();
  return id ? <EditHoles courseId={id} /> : <NewCourse />;
}

function NewCourse() {
  const nav = useNavigate();
  const geo = useGeolocation(false);
  const [params] = useSearchParams();
  const presetLat = Number(params.get("lat"));
  const presetLon = Number(params.get("lon"));
  const preset = Number.isFinite(presetLat) && Number.isFinite(presetLon) && params.get("lat") ? { lat: presetLat, lon: presetLon } : null;
  const [name, setName] = useState(params.get("name") ?? "");
  const [holeCount, setHoleCount] = useState(18);
  const [defaultPar, setDefaultPar] = useState(3);
  const [pos, setPos] = useState<LatLon | null>(preset);
  const [placeQ, setPlaceQ] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  const satellite = useSetting<boolean>("satellite", false);

  useEffect(() => {
    if (geo.position && !preset) setPos({ lat: geo.position.lat, lon: geo.position.lon });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.position]);

  useEffect(() => {
    if (!pos) getSetting<LatLon | null>("lastArea", null).then((o) => o && setPos((cur) => cur ?? { lat: o.lat, lon: o.lon }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create() {
    if (!name.trim() || !pos) return;
    setBusy(true);
    const course = await createCustomCourse({ name, lat: pos.lat, lon: pos.lon, holeCount, defaultPar, city: params.get("city") || undefined });
    nav(`/courses/${course.id}/edit`, { replace: true });
  }

  return (
    <div>
      <PageHeader title="Add a course" back={() => nav(-1)} />
      <div className="space-y-4 px-4">
        <Field label="Course name" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Riverside Park" autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Holes" name="holes" type="number" inputMode="numeric" min={1} max={36} value={holeCount} onChange={(e) => setHoleCount(Math.max(1, Math.min(36, Number(e.target.value) || 1)))} />
          <Field label="Default par" name="par" type="number" inputMode="numeric" min={2} max={6} value={defaultPar} onChange={(e) => setDefaultPar(Math.max(2, Math.min(6, Number(e.target.value) || 3)))} />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-medium text-ink-2">Location</span>
            <button className="flex items-center gap-1 text-sm font-semibold text-birdie" onClick={geo.locate}>
              <LocateFixed size={14} /> Use my location
            </button>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!placeQ.trim()) return;
              setPlaces(await searchPlace(placeQ).catch(() => []));
            }}
            className="flex gap-2"
          >
            <Field name="place" value={placeQ} onChange={(e) => setPlaceQ(e.target.value)} placeholder="Search a place" className="flex-1" />
            <Button type="submit" className="h-12">
              Search
            </Button>
          </form>
          {places && (
            <div className="mt-2 overflow-hidden rounded-card bg-surface shadow-card">
              {places.length === 0 && <div className="px-4 py-3 text-sm text-ink-2">No places matched.</div>}
              {places.map((p) => (
                <button
                  key={`${p.lat},${p.lon}`}
                  onClick={() => {
                    setPos({ lat: p.lat, lon: p.lon });
                    setPlaces(null);
                  }}
                  className="block w-full border-b hairline px-4 py-3 text-left text-sm last:border-b-0"
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-ink-3">Tap the map to place the course.</p>
          <CourseMap center={pos ?? { lat: 40, lon: -95 }} zoom={pos ? 15 : 3} user={geo.position} satellite={satellite} onMapClick={setPos} fitOn="none" className="mt-2 h-64 rounded-card shadow-card">
            {pos && <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl">📍</div>}
          </CourseMap>
          {pos && (
            <p className="numeric mt-1 text-xs text-ink-3">
              {pos.lat.toFixed(5)}, {pos.lon.toFixed(5)}
            </p>
          )}
        </div>
        <Button variant="primary" size="lg" full onClick={create} disabled={!name.trim() || !pos || busy}>
          {busy ? <Spinner /> : "Create course"}
        </Button>
      </div>
    </div>
  );
}

function EditHoles({ courseId }: { courseId: string }) {
  const nav = useNavigate();
  const course = useCourse(courseId);
  const holes = useHoles(courseId);
  const units = useSetting<Units>("units", "ft");
  const satellite = useSetting<boolean>("satellite", false);
  const geo = useGeolocation(false);
  const [selected, setSelected] = useState<number>(1);
  const [placing, setPlacing] = useState<"tee" | "basket" | "course">("tee");
  const [mapCenter, setMapCenter] = useState<LatLon | null>(null);
  const [placeQ, setPlaceQ] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const needsLocation = !!course?.tags?.__needsLocation;
  useEffect(() => {
    if (needsLocation) setPlacing("course");
  }, [needsLocation]);
  const [name, setName] = useState<string | null>(null);

  const hole = useMemo(() => holes.find((h) => h.number === selected), [holes, selected]);

  async function onMapClick(p: LatLon) {
    if (placing === "course") {
      const tags = { ...(course?.tags ?? {}) };
      delete tags.__needsLocation;
      await db.courses.update(courseId, { lat: p.lat, lon: p.lon, tags, updatedAt: Date.now() });
      setPlacing("tee");
      return;
    }
    if (!hole) return;
    const next: Hole = { ...hole, [placing]: p };
    if (next.tee && next.basket) {
      next.distanceM = Math.round(haversineM(next.tee, next.basket));
      next.path = [next.tee, next.basket];
    }
    await updateHole(next);
    // Advance: tee → basket → next hole tee.
    if (placing === "tee") setPlacing("basket");
    else {
      setPlacing("tee");
      if (holes.some((h) => h.number === selected + 1)) setSelected(selected + 1);
    }
  }

  async function setPar(h: Hole, par: number) {
    await updateHole({ ...h, par: Math.max(1, Math.min(9, par)) });
  }

  async function setLength(h: Hole, raw: string) {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    await updateHole({ ...h, distanceM: units === "ft" ? Math.round(v * 0.3048) : Math.round(v) });
  }

  async function addHole() {
    const n = holes.length + 1;
    await updateHole({ id: `${courseId}-${n}`, courseId, number: n, par: 3, updatedAt: Date.now() });
    setSelected(n);
  }

  async function removeLast() {
    if (holes.length <= 1) return;
    const rest = holes.slice(0, -1);
    await saveHoles(courseId, rest, false);
    await db.courses.update(courseId, { tags: { ...(course?.tags ?? {}), __edited: "1" } });
    setSelected(Math.min(selected, rest.length));
  }

  async function saveName() {
    if (name !== null && name.trim() && course) {
      await db.courses.update(courseId, { name: name.trim(), updatedAt: Date.now() });
    }
    setName(null);
  }

  if (!course) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Edit holes" sub={course.name} back={() => nav(`/courses/${courseId}`, { replace: true })} right={<Button variant="brand" size="sm" onClick={() => nav(`/courses/${courseId}`, { replace: true })}>Done</Button>} />
      <div className="px-4">
        <div className="mb-3 flex items-center gap-2">
          {name === null ? (
            <button className="text-sm font-semibold text-birdie" onClick={() => setName(course.name)}>
              Rename course
            </button>
          ) : (
            <>
              <Field name="cname" value={name} onChange={(e) => setName(e.target.value)} className="h-10 flex-1" autoFocus />
              <Button size="sm" variant="brand" onClick={saveName}>
                Save
              </Button>
            </>
          )}
        </div>
        {placing === "course" ? (
          <div className="mb-2">
            <p className="text-sm text-ink-2">Tap the map where this course is. Search a place to jump there first.</p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!placeQ.trim()) return;
                setPlaces(await searchPlace(placeQ).catch(() => []));
              }}
              className="mt-2 flex gap-2"
            >
              <Field name="cplace" value={placeQ} onChange={(e) => setPlaceQ(e.target.value)} placeholder="Park name or address" className="h-10 flex-1" />
              <Button type="submit" className="h-10">
                Search
              </Button>
            </form>
            {places && (
              <div className="mt-2 overflow-hidden rounded-card bg-surface shadow-card">
                {places.length === 0 && <div className="px-4 py-3 text-sm text-ink-2">No places matched.</div>}
                {places.map((p) => (
                  <button
                    key={`${p.lat},${p.lon}`}
                    onClick={() => {
                      setMapCenter({ lat: p.lat, lon: p.lon });
                      setPlaces(null);
                    }}
                    className="block w-full border-b hairline px-4 py-3 text-left text-sm last:border-b-0"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="mb-2 text-sm text-ink-2">
            Hole <strong>{selected}</strong>: tap the map to set the <strong>{placing}</strong>.
            <button className="ml-2 font-semibold text-birdie" onClick={() => setPlacing(placing === "tee" ? "basket" : "tee")}>
              Switch to {placing === "tee" ? "basket" : "tee"}
            </button>
            <button className="ml-2 font-semibold text-birdie" onClick={() => setPlacing("course")}>
              Move course pin
            </button>
          </p>
        )}
        <CourseMap center={mapCenter ?? course} holes={holes} activeHole={selected} user={geo.position} satellite={satellite} onSatelliteChange={(v) => setSetting("satellite", v)} onMapClick={onMapClick} onHoleClick={setSelected} fitOn={placing === "course" ? "none" : hole?.tee ? "active" : "holes"} zoom={placing === "course" ? 15 : undefined} className="h-[42dvh] rounded-card shadow-card" />
        {!geo.position && (
          <button className="mt-2 flex items-center gap-1 text-sm font-semibold text-birdie" onClick={geo.locate}>
            <LocateFixed size={14} /> Show my position on the map
          </button>
        )}
      </div>

      <Section title="Pars and lengths" className="mt-5">
        <div className="overflow-hidden rounded-card bg-surface shadow-card">
          <div className="grid grid-cols-[3rem_1fr_1fr_5rem] items-center border-b hairline px-3 py-2 text-[11px] font-semibold text-ink-3">
            <span>Hole</span>
            <span>Par</span>
            <span>Length ({units === "ft" ? "ft" : "m"})</span>
            <span className="text-right">Pins</span>
          </div>
          {holes.map((h) => (
            <div key={h.id} className={cx("grid grid-cols-[3rem_1fr_1fr_5rem] items-center gap-2 border-b hairline px-3 py-2 last:border-b-0", selected === h.number && "bg-surface-2")}>
              <button className="display numeric text-left text-lg" onClick={() => setSelected(h.number)}>
                {h.number}
              </button>
              <div className="flex items-center gap-1">
                <button aria-label={`Lower par hole ${h.number}`} className="h-9 w-9 rounded-full bg-surface-3 font-bold" onClick={() => setPar(h, h.par - 1)}>
                  −
                </button>
                <span className="numeric w-6 text-center font-semibold">{h.par}</span>
                <button aria-label={`Raise par hole ${h.number}`} className="h-9 w-9 rounded-full bg-surface-3 font-bold" onClick={() => setPar(h, h.par + 1)}>
                  +
                </button>
              </div>
              <input
                aria-label={`Length hole ${h.number}`}
                type="number"
                inputMode="numeric"
                className="numeric h-9 w-full rounded-lg border border-line-strong bg-surface px-2 text-sm"
                defaultValue={h.distanceM ? Math.round(units === "ft" ? h.distanceM * 3.28084 : h.distanceM) : ""}
                key={`${h.id}-${units}-${h.distanceM ?? ""}`}
                onBlur={(e) => e.target.value && setLength(h, e.target.value)}
              />
              <span className="text-right text-xs text-ink-3">{h.tee && h.basket ? formatHoleDistance(h.distanceM ?? 0, units) : h.tee ? "tee set" : "—"}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Button onClick={addHole} className="flex-1">
            <Plus size={16} /> Add hole
          </Button>
          <Button onClick={removeLast} disabled={holes.length <= 1} className="flex-1">
            <Trash2 size={16} /> Remove last
          </Button>
        </div>
        <p className="mt-3 mb-4 text-xs text-ink-3">Edits stay on this device and are kept even when the map data refreshes.</p>
      </Section>
    </div>
  );
}
