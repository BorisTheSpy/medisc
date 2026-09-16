import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Check, Plus, Search, UserPlus } from "lucide-react";
import { useCourses, useHoles, useMe, usePlayers } from "@/db/hooks";
import { createPlayer, createRound, getSetting } from "@/db/repo";
import { haversineM, formatDistance, type Units } from "@/domain/geo";
import type { Course, LatLon } from "@/domain/types";
import { useSetting } from "@/db/hooks";
import { Avatar, Button, Chip, Field, PageHeader, Section, Sheet, cx } from "@/components/ui";

export function NewRoundRoute() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const me = useMe();
  const players = usePlayers();
  const courses = useCourses();
  const units = useSetting<Units>("units", "ft");
  const [courseId, setCourseId] = useState<string | null>(params.get("course"));
  const course = courses.find((c) => c.id === courseId) ?? null;
  const holes = useHoles(course?.id);
  const [selected, setSelected] = useState<string[]>([]);
  const [startingHole, setStartingHole] = useState(1);
  const [subset, setSubset] = useState<"all" | "front" | "back">("all");
  const [trackThrows, setTrackThrows] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [origin, setOrigin] = useState<LatLon | null>(null);
  const [busy, setBusy] = useState(false);
  const [courseFilter, setCourseFilter] = useState("");

  useEffect(() => {
    if (me && selected.length === 0) setSelected([me.id]);
  }, [me, selected.length]);

  useEffect(() => {
    getSetting<LatLon | null>("lastOrigin", null).then(setOrigin);
    getSetting<boolean>("trackThrows", false).then(setTrackThrows);
  }, []);

  const recent = useMemo(() => players.filter((p) => !p.isMe).sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0)), [players]);

  const sortedCourses = useMemo(() => {
    const q = courseFilter.trim().toLowerCase();
    return courses
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .map((c) => ({ c, d: origin ? haversineM(origin, c) : Infinity }))
      .sort((a, b) => a.d - b.d);
  }, [courses, origin, courseFilter]);

  const holeNumbers = useMemo(() => {
    const all = holes.map((h) => h.number);
    if (subset === "front") return all.slice(0, Math.ceil(all.length / 2));
    if (subset === "back") return all.slice(Math.ceil(all.length / 2));
    return all;
  }, [holes, subset]);

  useEffect(() => {
    if (!holeNumbers.includes(startingHole)) setStartingHole(holeNumbers[0] ?? 1);
  }, [holeNumbers, startingHole]);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function addGuest() {
    const name = guestName.trim();
    if (!name) return;
    const p = await createPlayer(name);
    setSelected((s) => [...s, p.id]);
    setGuestName("");
    setGuestOpen(false);
  }

  async function start() {
    if (!course || holes.length === 0 || selected.length === 0) return;
    setBusy(true);
    const round = await createRound({ course, holes, playerIds: selected, startingHole, holeNumbers, trackThrows });
    nav(`/rounds/${round.id}/play`, { replace: true });
  }

  const totalPar = holes.filter((h) => holeNumbers.includes(h.number)).reduce((a, h) => a + h.par, 0);

  return (
    <div className="pb-32">
      <PageHeader title="New round" back={() => nav(-1)} />

      <Section title="Course">
        {course ? (
          <div className="flex items-center gap-3 rounded-card bg-surface p-4 shadow-card">
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{course.name}</div>
              <div className="text-xs text-ink-3">
                {holes.length} holes{totalPar ? ` · par ${totalPar}` : ""}
                {holes.length === 0 && " · open the course page first to load holes"}
              </div>
            </div>
            <Button size="sm" onClick={() => setCourseId(null)}>
              Change
            </Button>
          </div>
        ) : (
          <div>
            <div className="relative">
              <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
              <Field name="cf" value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} placeholder="Courses you've opened" className="pl-10" aria-label="Filter courses" />
            </div>
            <div className="mt-2 overflow-hidden rounded-card bg-surface shadow-card">
              {sortedCourses.length === 0 && (
                <div className="px-4 py-4 text-sm text-ink-2">
                  No saved courses yet.{" "}
                  <button className="font-semibold text-birdie" onClick={() => nav("/courses")}>
                    Find one nearby
                  </button>
                  .
                </div>
              )}
              {sortedCourses.slice(0, 12).map(({ c, d }) => (
                <CourseOption key={c.id} course={c} distance={Number.isFinite(d) ? formatDistance(d, units) : undefined} onClick={() => setCourseId(c.id)} />
              ))}
            </div>
            <button className="mt-2 flex items-center gap-1 text-sm font-semibold text-birdie" onClick={() => nav("/courses")}>
              <Search size={14} /> Search courses near me
            </button>
          </div>
        )}
      </Section>

      <Section title="Players" className="mt-6">
        <div className="flex flex-wrap gap-2">
          {me && (
            <Chip active={selected.includes(me.id)} onClick={() => toggle(me.id)}>
              <Avatar name={me.name} color={me.color} size={20} /> {me.name} (you)
            </Chip>
          )}
          {recent.map((p) => (
            <Chip key={p.id} active={selected.includes(p.id)} onClick={() => toggle(p.id)}>
              <Avatar name={p.name} color={p.color} size={20} /> {p.name}
              {selected.includes(p.id) ? <Check size={14} /> : null}
            </Chip>
          ))}
          <Chip onClick={() => setGuestOpen(true)}>
            <UserPlus size={16} /> Add player
          </Chip>
        </div>
      </Section>

      {course && holes.length > 0 && (
        <Section title="Holes" className="mt-6">
          {holes.length >= 12 && (
            <div className="mb-3 flex gap-2">
              {(["all", "front", "back"] as const).map((s) => (
                <Chip key={s} active={subset === s} onClick={() => setSubset(s)}>
                  {s === "all" ? `All ${holes.length}` : s === "front" ? `Front ${Math.ceil(holes.length / 2)}` : `Back ${holes.length - Math.ceil(holes.length / 2)}`}
                </Chip>
              ))}
            </div>
          )}
          <div className="text-sm font-medium text-ink-2">Start on hole</div>
          <div className="mt-2 grid grid-cols-9 gap-1.5">
            {holeNumbers.map((n) => (
              <button key={n} onClick={() => setStartingHole(n)} className={cx("numeric h-10 rounded-lg text-sm font-bold", startingHole === n ? "bg-brand text-brand-ink" : "bg-surface-2 text-ink")}>
                {n}
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section className="mt-6">
        <label className="flex items-center justify-between rounded-card bg-surface p-4 shadow-card">
          <div>
            <div className="font-semibold">Track throws</div>
            <div className="text-xs text-ink-3">Log where each throw lands to unlock fairway, putting and scramble stats.</div>
          </div>
          <input type="checkbox" className="h-6 w-6 accent-[var(--accent)]" checked={trackThrows} onChange={(e) => setTrackThrows(e.target.checked)} />
        </label>
      </Section>

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 flex justify-center bg-gradient-to-t from-bg via-bg/95 to-transparent px-4 pt-6 pb-4">
        <div className="w-full max-w-[448px]">
          <Button variant="primary" size="lg" full onClick={start} disabled={!course || holes.length === 0 || selected.length === 0 || busy}>
            Start round{selected.length > 1 ? ` · ${selected.length} players` : ""}
          </Button>
        </div>
      </div>

      <Sheet open={guestOpen} onClose={() => setGuestOpen(false)} title="Add a player">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addGuest();
          }}
        >
          <Field name="guest" label="Name" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Alex" autoFocus maxLength={40} />
          <Button type="submit" variant="primary" size="lg" full className="mt-4" disabled={!guestName.trim()}>
            <Plus size={18} /> Add to card
          </Button>
          <p className="mt-3 text-center text-xs text-ink-3">Players are saved on this device so you can add them again next time.</p>
        </form>
      </Sheet>
    </div>
  );
}

function CourseOption({ course, distance, onClick }: { course: Course; distance?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 border-b hairline px-4 py-3 text-left last:border-b-0 active:bg-surface-2">
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{course.name}</div>
        <div className="text-xs text-ink-3">
          {course.holeCount} holes{course.par ? ` · par ${course.par}` : ""}
          {course.city ? ` · ${course.city}` : ""}
        </div>
      </div>
      {distance && <span className="numeric text-sm text-ink-2">{distance}</span>}
    </button>
  );
}
