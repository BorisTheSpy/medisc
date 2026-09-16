import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Play, Pencil, RefreshCw, ExternalLink } from "lucide-react";
import { useAllScores, useCourse, useHoles, useMe, useRounds, useSetting } from "@/db/hooks";
import { fetchCourseHoles } from "@/services/overpass";
import { saveHoles, setSetting } from "@/db/repo";
import { useGeolocation } from "@/services/useGeolocation";
import { formatDistance, type Units } from "@/domain/geo";
import { holeStatsForCourse, perCourse } from "@/domain/stats";
import { formatToPar } from "@/domain/scoring";
import { avg } from "@/lib/format";
import { Button, IconButton, PageHeader, Section, Spinner, StatTile, cx } from "@/components/ui";
import { CourseMap } from "@/map/CourseMap";
import type { Hole } from "@/domain/types";

export function CourseDetailRoute() {
  const { id } = useParams();
  const nav = useNavigate();
  const course = useCourse(id);
  const holes = useHoles(id);
  const me = useMe();
  const rounds = useRounds();
  const scores = useAllScores();
  const units = useSetting<Units>("units", "ft");
  const satellite = useSetting<boolean>("satellite", false);
  const geo = useGeolocation(false);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeHole, setActiveHole] = useState<number | undefined>(undefined);
  const attempted = useRef(false);

  const needsFetch = course && course.source !== "custom" && !course.fetchedHolesAt;

  async function refetch(force = false) {
    if (!course || course.source === "custom") return;
    setFetching(true);
    setFetchError(null);
    try {
      const found = await fetchCourseHoles(course);
      if (found.length > 0) {
        await saveHoles(course.id, found);
      } else if (holes.length === 0 || force) {
        // Nothing mapped: create default holes so a round can start, but keep hole count from tags.
        const now = Date.now();
        const defaults: Hole[] = Array.from({ length: course.holeCount || 18 }, (_, i) => ({ id: `${course.id}-${i + 1}`, courseId: course.id, number: i + 1, par: 3, updatedAt: now }));
        await saveHoles(course.id, holes.length === 0 ? defaults : holes);
        setFetchError("OpenStreetMap has no hole details for this course yet. Pars default to 3. Edit holes to set the real layout.");
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Could not load hole details");
      if (holes.length === 0) {
        const now = Date.now();
        const defaults: Hole[] = Array.from({ length: course.holeCount || 18 }, (_, i) => ({ id: `${course.id}-${i + 1}`, courseId: course.id, number: i + 1, par: 3, updatedAt: now }));
        await saveHoles(course.id, defaults, false);
      }
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (needsFetch && !attempted.current) {
      attempted.current = true;
      refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsFetch]);

  const finished = useMemo(() => rounds.filter((r) => r.finishedAt && r.courseId === id), [rounds, id]);
  const mine = useMemo(() => (me && id ? perCourse(finished, scores, me.id).find((c) => c.courseId === id) : undefined), [finished, scores, me, id]);
  const holeStats = useMemo(() => (me && id ? holeStatsForCourse(finished, scores, me.id, id) : []), [finished, scores, me, id]);
  const mapped = holes.filter((h) => h.tee && h.basket).length;
  const totalPar = holes.reduce((a, h) => a + h.par, 0);
  const totalLen = holes.reduce((a, h) => a + (h.distanceM ?? 0), 0);

  if (course === undefined) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner />
      </div>
    );
  }
  if (course === null) {
    return (
      <div>
        <PageHeader title="Course not found" back={() => nav(-1)} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={course.name}
        sub={[course.city, `${holes.length || course.holeCount} holes`, totalPar ? `par ${totalPar}` : null, totalLen ? formatDistance(totalLen, units) : null].filter(Boolean).join(" · ")}
        back={() => nav(-1)}
        right={
          <IconButton label="Edit holes" onClick={() => nav(`/courses/${course.id}/edit`)}>
            <Pencil size={20} />
          </IconButton>
        }
      />

      <div className="px-4">
        <CourseMap
          center={course}
          holes={holes}
          activeHole={activeHole}
          user={geo.position}
          satellite={satellite}
          onSatelliteChange={(v) => setSetting("satellite", v)}
          onHoleClick={(n) => setActiveHole((a) => (a === n ? undefined : n))}
          fitOn={activeHole ? "active" : "holes"}
          className="h-[46dvh] rounded-card shadow-card"
        >
          {fetching && (
            <div className="absolute left-2 top-2 flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-xs font-medium shadow-card">
              <Spinner className="h-3.5 w-3.5" /> Loading holes from OpenStreetMap
            </div>
          )}
          {!fetching && mapped === 0 && holes.length > 0 && <div className="absolute left-2 top-2 rounded-full bg-surface px-3 py-1.5 text-xs font-medium shadow-card">No tee or basket positions yet</div>}
        </CourseMap>

        <div className="mt-3 flex gap-2">
          <Button variant="primary" size="lg" className="flex-1" onClick={() => nav(`/play?course=${course.id}`)} disabled={holes.length === 0}>
            <Play size={20} fill="currentColor" /> Play here
          </Button>
          {!geo.position && (
            <Button size="lg" onClick={geo.locate} aria-label="Show my position">
              Locate me
            </Button>
          )}
        </div>

        {fetchError && (
          <div className="mt-3 rounded-card bg-surface-2 px-4 py-3 text-sm text-ink-2">
            {fetchError}
            {course.source !== "custom" && (
              <button className="ml-2 font-semibold text-birdie" onClick={() => refetch(true)}>
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      {mine && (
        <Section title="Your record here" className="mt-6">
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="Rounds" value={mine.rounds} />
            <StatTile label="Best" value={formatToPar(mine.bestToPar)} tone={mine.bestToPar < 0 ? "good" : undefined} />
            <StatTile label="Average" value={avg(mine.avgToPar)} />
          </div>
        </Section>
      )}

      <Section
        title="Holes"
        className="mt-6"
        action={
          course.source !== "custom" && (
            <button className="flex items-center gap-1 text-sm font-semibold text-birdie disabled:opacity-40" onClick={() => refetch(true)} disabled={fetching}>
              <RefreshCw size={14} /> Reload from map
            </button>
          )
        }
      >
        {holes.length === 0 ? (
          <div className="rounded-card bg-surface p-4 text-sm text-ink-2 shadow-card">{fetching ? "Loading…" : "No holes yet. Edit holes to set them up."}</div>
        ) : (
          <div className="overflow-hidden rounded-card bg-surface shadow-card">
            <div className="grid grid-cols-[3rem_1fr_4.5rem_4.5rem_4.5rem] items-center border-b hairline px-3 py-2 text-[11px] font-semibold text-ink-3">
              <span>Hole</span>
              <span>Par</span>
              <span className="text-right">Length</span>
              <span className="text-right">Your avg</span>
              <span className="text-right">Best</span>
            </div>
            {holes.map((h) => {
              const hs = holeStats.find((s) => s.holeNumber === h.number);
              return (
                <button
                  key={h.id}
                  onClick={() => setActiveHole((a) => (a === h.number ? undefined : h.number))}
                  className={cx("grid w-full grid-cols-[3rem_1fr_4.5rem_4.5rem_4.5rem] items-center border-b hairline px-3 py-2.5 text-left text-sm last:border-b-0", activeHole === h.number && "bg-surface-2")}
                >
                  <span className="display numeric text-lg">{h.number}</span>
                  <span className="numeric text-ink-2">{h.par}</span>
                  <span className="numeric text-right text-ink-2">{h.distanceM ? formatDistance(h.distanceM, units) : "–"}</span>
                  <span className={cx("numeric text-right", hs && hs.avgToPar < 0 ? "text-birdie" : hs && hs.avgToPar > 0.5 ? "text-triple" : "text-ink-2")}>{hs ? hs.avgStrokes.toFixed(1) : "–"}</span>
                  <span className="numeric text-right text-ink-2">{hs ? hs.best : "–"}</span>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      {(course.website || course.source !== "custom") && (
        <Section className="mt-6 mb-4">
          <div className="flex flex-wrap gap-3 text-xs text-ink-3">
            {course.website && (
              <a href={course.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-birdie">
                Course website <ExternalLink size={12} />
              </a>
            )}
            {course.source === "osm" && course.osmType && (
              <a href={`https://www.openstreetmap.org/${course.osmType}/${course.osmId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">
                Data © OpenStreetMap contributors <ExternalLink size={12} />
              </a>
            )}
            {course.source === "dga" && <span>Course data supplied by DiscGolfAPI.</span>}
          </div>
        </Section>
      )}
    </div>
  );
}
