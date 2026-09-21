import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { Play, Pencil, RefreshCw, ExternalLink } from "lucide-react";
import { useAllScores, useCourse, useHoles, useLayouts, useMe, useRounds, useSetting } from "@/db/hooks";
import { fetchCourseHoles } from "@/services/overpass";
import { fetchCommunityHoles, mergeHoles, publishCourseNow, hideCourse } from "@/services/community";
import { saveHoles, setSetting, upsertLayouts } from "@/db/repo";
import { MAIN_LAYOUT, formatLengthBin, layoutsFor, pickLayout, roundLayoutId } from "@/domain/layouts";
import { db } from "@/db/db";
import { useGeolocation } from "@/services/useGeolocation";
import { formatDifficulty, formatHoleDistance, type Units } from "@/domain/geo";
import { holeStatsForCourse, perCourse } from "@/domain/stats";
import { formatToPar } from "@/domain/scoring";
import { avg } from "@/lib/format";
import { Button, Chip, IconButton, PageHeader, Section, Sheet, Spinner, StatTile, cx } from "@/components/ui";
import { CourseMap } from "@/map/CourseMap";
import type { Hole } from "@/domain/types";

export function CourseDetailRoute() {
  const { id } = useParams();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const course = useCourse(id);
  const layoutRows = useLayouts(id);
  const layouts = useMemo(() => (course ? layoutsFor(course, layoutRows) : []), [course, layoutRows]);
  const [wantedLayout, setWantedLayout] = useState<string>(params.get("layout") || MAIN_LAYOUT);
  const layout = layouts.length ? pickLayout(layouts, wantedLayout) : null;
  const layoutId = layout?.layoutId ?? MAIN_LAYOUT;
  const holes = useHoles(id, layoutId);
  const me = useMe();
  const rounds = useRounds();
  const scores = useAllScores();
  const units = useSetting<Units>("units", "ft");
  const satellite = useSetting<boolean>("satellite", false);
  const geo = useGeolocation(false);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeHole, setActiveHole] = useState<number | undefined>(undefined);
  const [shareState, setShareState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const [reportOpen, setReportOpen] = useState(false);
  const [reporting, setReporting] = useState(false);

  async function reportNotACourse() {
    if (!course) return;
    setReporting(true);
    await hideCourse(course);
    await db.courses.update(course.id, { deletedAt: Date.now(), updatedAt: Date.now() });
    nav("/courses", { replace: true });
  }
  const attempted = useRef(false);

  const needsFetch = course && course.source !== "custom" && !course.fetchedHolesAt;

  function defaultHoles(): Hole[] {
    const now = Date.now();
    return Array.from({ length: course?.holeCount || 18 }, (_, i) => ({ id: `${course!.id}-${i + 1}`, courseId: course!.id, layoutId: MAIN_LAYOUT, number: i + 1, par: 3, updatedAt: now }));
  }

  /** Pull shared holes (other players' pins and pars) and merge them into the local copy. */
  async function syncShared(): Promise<boolean> {
    if (!course) return false;
    try {
      const shared = await fetchCommunityHoles(course);
      if (!shared) return false;
      if (shared.name && shared.name !== course.name && !course.tags?.__renamed) {
        await db.courses.update(course.id, { name: shared.name, updatedAt: Date.now() });
        await db.rounds.where("courseId").equals(course.id).modify({ courseName: shared.name });
      }
      if ((shared.difficulty && shared.difficulty !== course.difficulty) || (shared.rating !== undefined && shared.rating !== course.rating)) {
        await db.courses.update(course.id, { difficulty: shared.difficulty ?? course.difficulty, rating: shared.rating ?? course.rating, updatedAt: Date.now() });
      }
      if (shared.layouts.length > 0) await upsertLayouts(course.id, shared.layouts.map(({ holes: _holes, ...meta }) => meta));
      // Extra layouts only ever come from the shared database, so merge each one on its own.
      for (const l of shared.layouts) {
        if (l.layoutId === MAIN_LAYOUT || l.holes.length === 0) continue;
        const localLayout = await db.holes.where("[courseId+layoutId]").equals([course.id, l.layoutId]).toArray();
        const { merged, changed } = mergeHoles(localLayout, l.holes);
        if (changed) await saveHoles(course.id, merged, true, l.layoutId);
      }
      if (shared.holes.length === 0) return false;
      const local = await db.holes.where("[courseId+layoutId]").equals([course.id, MAIN_LAYOUT]).toArray();
      const { merged, changed } = mergeHoles(local, shared.holes);
      if (changed) await saveHoles(course.id, merged);
      return true;
    } catch {
      return false;
    }
  }

  async function refetch(force = false) {
    if (!course || course.source === "custom") return;
    setFetching(true);
    setFetchError(null);
    // Make the course playable right away, but only if it truly has no holes yet (read storage, not React state).
    const stored = await db.holes.where("[courseId+layoutId]").equals([course.id, MAIN_LAYOUT]).count();
    if (stored === 0) await saveHoles(course.id, defaultHoles(), false);
    try {
      const hadShared = await syncShared();
      if (course.source === "community") return; // community courses only come from the shared database
      const found = await fetchCourseHoles(course);
      const local = await db.holes.where("[courseId+layoutId]").equals([course.id, MAIN_LAYOUT]).toArray();
      if (found.length > 0) {
        // Keep local pins and pars edited by players; OSM fills in only what nobody has mapped.
        const { merged } = mergeHoles(found, local.filter((h) => h.tee || h.basket));
        await saveHoles(course.id, merged);
      } else if (!hadShared) {
        if (!course.fetchedHolesAt) await db.courses.update(course.id, { fetchedHolesAt: Date.now() });
        if (!local.some((h) => h.tee || h.basket)) {
          setFetchError("No hole details for this course yet. Pars default to 3. Edit holes to set the layout, or mark tees and baskets while you play, and it will be shared with everyone.");
        }
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Could not load hole details");
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (!course || attempted.current) return;
    attempted.current = true;
    if (needsFetch) refetch();
    else syncShared();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course?.id, needsFetch]);

  const finished = useMemo(() => rounds.filter((r) => r.finishedAt && r.courseId === id), [rounds, id]);
  const mine = useMemo(() => (me && id ? perCourse(finished, scores, me.id).find((c) => c.courseId === id) : undefined), [finished, scores, me, id]);
  // Per-hole numbers only make sense within one layout: hole 3 long and hole 3 short are different holes.
  const onThisLayout = useMemo(() => finished.filter((r) => roundLayoutId(r) === layoutId), [finished, layoutId]);
  const holeStats = useMemo(() => (me && id ? holeStatsForCourse(onThisLayout, scores, me.id, id) : []), [onThisLayout, scores, me, id]);
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
        sub={[course.city, `${holes.length || layout?.holeCount || course.holeCount} holes`, totalPar ? `par ${totalPar}` : null, totalLen ? formatHoleDistance(totalLen, units) : null, formatDifficulty(layout?.difficulty ?? course.difficulty), course.rating ? `★ ${course.rating.toFixed(1)}` : null]
          .filter(Boolean)
          .join(" · ")}
        back={() => nav(-1)}
        right={
          <IconButton label="Edit holes" onClick={() => nav(`/courses/${course.id}/edit?layout=${encodeURIComponent(layoutId)}`)}>
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

        {layouts.length > 1 && (
          <div className="mt-3">
            <div className="label mb-2 text-ink-3">Layout</div>
            <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
              {layouts.map((l) => (
                <Chip key={l.layoutId} active={l.layoutId === layoutId} onClick={() => setWantedLayout(l.layoutId)}>
                  {l.name}
                  {formatLengthBin(l.lengthBin) && <span className={cx("normal-case", l.layoutId === layoutId ? "opacity-70" : "text-ink-3")}>· {formatLengthBin(l.lengthBin)}</span>}
                </Chip>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <Button variant="primary" size="lg" className="flex-1" onClick={() => nav(`/play?course=${course.id}&layout=${encodeURIComponent(layoutId)}`)} disabled={holes.length === 0}>
            <Play size={20} fill="currentColor" /> Play {layouts.length > 1 && layout ? layout.name : "here"}
          </Button>
          {!geo.position && (
            <Button size="lg" onClick={geo.locate} aria-label="Show my position">
              Locate me
            </Button>
          )}
        </div>

        {course.tags?.__needsLocation && (
          <div className="mt-3 rounded-card bg-surface-2 px-4 py-3 text-sm text-ink-2">
            This course came from your UDisc import and has no map location yet.
            <button className="ml-2 font-semibold text-birdie" onClick={() => nav(`/courses/${course.id}/edit`)}>
              Set location
            </button>
          </div>
        )}
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

      {mapped > 0 && (
        <Section className="mt-4">
          <div className="flex items-center justify-between rounded-card bg-surface px-4 py-3 shadow-card">
            <div className="text-sm">
              <div className="font-semibold">
                {mapped} of {holes.length} holes have pins
              </div>
              <div className="text-xs text-ink-3">{shareState === "done" ? "Shared with everyone just now." : shareState === "failed" ? "Could not reach the server. Will retry." : "Pins are shared with every player automatically."}</div>
            </div>
            <Button
              size="sm"
              disabled={shareState === "busy"}
              onClick={async () => {
                setShareState("busy");
                setShareState((await publishCourseNow(course.id)) ? "done" : "failed");
              }}
            >
              {shareState === "busy" ? <Spinner className="h-4 w-4" /> : <RefreshCw size={14} />} Share now
            </Button>
          </div>
        </Section>
      )}

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
                  <span className="numeric text-right text-ink-2">{h.distanceM ? formatHoleDistance(h.distanceM, units) : "–"}</span>
                  <span className={cx("numeric text-right", hs && hs.avgToPar < 0 ? "text-birdie" : hs && hs.avgToPar > 0.5 ? "text-triple" : "text-ink-2")}>{hs ? hs.avgStrokes.toFixed(1) : "–"}</span>
                  <span className="numeric text-right text-ink-2">{hs ? hs.best : "–"}</span>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      {course.source !== "custom" && (
        <Section className="mt-6">
          <button className="label text-ink-3 underline underline-offset-4" onClick={() => setReportOpen(true)}>
            Not a disc golf course? Report it
          </button>
          <Sheet open={reportOpen} onClose={() => setReportOpen(false)} title="No disc golf here?">
            <p className="text-[15px] font-medium text-ink-2">“{course.name}” will disappear from course search for everyone. Your rounds here stay in your history.</p>
            <div className="mt-[22px] flex gap-[11px]">
              <Button variant="danger" onClick={reportNotACourse} disabled={reporting}>
                {reporting ? <Spinner /> : "Hide this place"}
              </Button>
              <Button variant="ghost" onClick={() => setReportOpen(false)}>
                Keep it
              </Button>
            </div>
          </Sheet>
        </Section>
      )}

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
            {course.source === "places" && <span>Powered by Google.</span>}
            {course.source === "community" && (course.tags?.origin === "udisc" ? <span>Layout and difficulty from UDisc.</span> : <span>Added by a Medisc player.</span>)}
          </div>
        </Section>
      )}
    </div>
  );
}
