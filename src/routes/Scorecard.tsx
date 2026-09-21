import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ChevronLeft, ChevronRight, Map as MapIcon, MoreHorizontal, Minus, Plus, Flag, Trash2, UserPlus, UserMinus, Undo2, Target, Crosshair, ListX } from "lucide-react";
import { useCourse, useHoles, usePlayers, useRound, useRoundScores, useSetting } from "@/db/hooks";
import { addPlayerToRound, adjustStrokes, createPlayer, deleteRound, finishRound, removePlayerFromRound, setHolePar, setSetting, setThrows, updateHole, removeHole, setHoleCount } from "@/db/repo";
import { publishCourseNow } from "@/services/community";
import { roundLayoutId } from "@/domain/layouts";
import { useGeolocation } from "@/services/useGeolocation";
import { formatHoleDistance, haversineM, type Units } from "@/domain/geo";
import { formatToPar, roundTotals, scoreLabel, isHoledOut } from "@/domain/scoring";
import type { HoleScore, Player, Zone } from "@/domain/types";
import { Avatar, Button, Field, IconButton, Sheet, Spinner, Toast, cx } from "@/components/ui";
import { CourseMap } from "@/map/CourseMap";

const ZONES: { zone: Zone; label: string; hint: string }[] = [
  { zone: "fairway", label: "Fairway", hint: "In play, outside circle 2" },
  { zone: "off_fairway", label: "Off fairway", hint: "Rough, trees, still in bounds" },
  { zone: "c2", label: "Circle 2", hint: "33–66 ft from the basket" },
  { zone: "c1", label: "Circle 1", hint: "Inside 33 ft" },
  { zone: "parked", label: "Parked", hint: "Inside 10 ft, a tap-in" },
  { zone: "ob", label: "OB", hint: "Out of bounds, +1 penalty" },
];

function formatAccuracyFt(m: number): number {
  return m * 3.28084;
}

/** A pin is only saved when the phone reports a fix at least this good. */
const MAX_PIN_ACCURACY_FT = 15;
const MAX_PIN_ACCURACY_M = MAX_PIN_ACCURACY_FT / 3.28084;

function holeKey(roundId: string) {
  return `medisc.hole.${roundId}`;
}

export function ScorecardRoute() {
  const { id } = useParams();
  const nav = useNavigate();
  const round = useRound(id);
  const scores = useRoundScores(id);
  const players = usePlayers();
  const course = useCourse(round?.courseId);
  const layoutId = roundLayoutId(round);
  const holes = useHoles(round?.courseId, layoutId);
  const units = useSetting<Units>("units", "ft");
  const satellite = useSetting<boolean>("satellite", false);
  const geo = useGeolocation(true);
  const [idx, setIdx] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(holeKey(id ?? ""))) || 0;
    } catch {
      return 0;
    }
  });
  const [mapPref, setMapPref] = useState<boolean | null>(null);
  const anyMapped = holes.some((h) => h.tee || h.basket);
  // Default: show the map only when the course actually has hole positions.
  const showMap = mapPref ?? anyMapped;
  const setShowMap = (v: boolean | ((prev: boolean) => boolean)) => setMapPref(typeof v === "function" ? v(showMap) : v);
  const [menuOpen, setMenuOpen] = useState(false);
  const [parOpen, setParOpen] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [trackerFor, setTrackerFor] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [confirmMark, setConfirmMark] = useState<"tee" | "basket" | null>(null);
  const [holesOpen, setHolesOpen] = useState(false);
  const [holeCountInput, setHoleCountInput] = useState("");
  const toastTimer = useRef<number | null>(null);
  function notify(msg: string) {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }

  /** Save the phone's current position as this hole's tee or basket, then share it. */
  async function markHere(what: "tee" | "basket", force = false) {
    if (!round || !course) return;
    if (!force && hole?.[what]) {
      setConfirmMark(what);
      return;
    }
    const pos = geo.position;
    if (!pos) {
      geo.locate();
      notify("Waiting for a GPS fix. Try again in a moment.");
      return;
    }
    if (pos.accuracy > MAX_PIN_ACCURACY_M) {
      notify(`GPS accuracy is ±${Math.round(formatAccuracyFt(pos.accuracy))} ft. Pins need ±${MAX_PIN_ACCURACY_FT} ft or better. Stand still in the open for a few seconds and tap again.`);
      return;
    }
    const existing = hole ?? { id: `${course.id}-${holeNumber}`, courseId: course.id, layoutId, number: holeNumber, par, updatedAt: Date.now() };
    const next = { ...existing, [what]: { lat: pos.lat, lon: pos.lon }, par: existing.par || par };
    if (next.tee && next.basket) {
      next.distanceM = Math.round(haversineM(next.tee, next.basket));
      next.path = [next.tee, next.basket];
    }
    await updateHole(next);
    const shared = await publishCourseNow(course.id);
    notify(`${what === "tee" ? "Tee" : "Basket"} saved for hole ${holeNumber} (±${Math.round(formatAccuracyFt(pos.accuracy))} ft). ${shared ? "Shared with everyone." : "Will share when back online."}`);
  }

  const order = useMemo(() => {
    if (!round) return [];
    const nums = round.holeNumbers;
    const startIdx = Math.max(0, nums.indexOf(round.startingHole));
    return [...nums.slice(startIdx), ...nums.slice(0, startIdx)];
  }, [round]);

  const holeNumber = order[Math.min(idx, Math.max(order.length - 1, 0))];
  const hole = holes.find((h) => h.number === holeNumber);
  const holeScores = useMemo(() => scores.filter((s) => s.holeNumber === holeNumber), [scores, holeNumber]);
  const par = holeScores[0]?.par ?? hole?.par ?? 3;
  const totals = useMemo(() => roundTotals(scores), [scores]);
  const cardPlayers = useMemo(() => (round ? round.playerIds.map((pid) => players.find((p) => p.id === pid)).filter((p): p is Player => !!p) : []), [round, players]);
  const distanceToBasket = geo.position && hole?.basket ? haversineM(geo.position, hole.basket) : null;
  const holesComplete = useMemo(() => {
    const done = new Set<number>();
    for (const n of order) if (scores.filter((s) => s.holeNumber === n).every((s) => s.strokes > 0)) done.add(n);
    return done;
  }, [order, scores]);
  const allDone = order.length > 0 && order.every((n) => holesComplete.has(n));

  useEffect(() => {
    if (id) {
      try {
        localStorage.setItem(holeKey(id), String(idx));
      } catch {
        /* ignore */
      }
    }
  }, [idx, id]);

  useEffect(() => {
    if (round?.finishedAt) nav(`/rounds/${round.id}`, { replace: true });
  }, [round, nav]);

  if (round === undefined || (round && !course)) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner />
      </div>
    );
  }
  if (round === null) {
    return (
      <div className="p-6 text-center">
        <p>This round no longer exists.</p>
        <Button className="mt-4" onClick={() => nav("/")}>
          Home
        </Button>
      </div>
    );
  }

  async function finish() {
    await finishRound(round!.id);
    try {
      localStorage.removeItem(holeKey(round!.id));
    } catch {
      /* ignore */
    }
    nav(`/rounds/${round!.id}`, { replace: true });
  }

  async function remove() {
    await deleteRound(round!.id);
    nav("/", { replace: true });
  }

  const trackerScore = trackerFor ? holeScores.find((s) => s.playerId === trackerFor) : undefined;
  const trackerPlayer = trackerFor ? cardPlayers.find((p) => p.id === trackerFor) : undefined;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="safe-top sticky top-0 z-20 bg-bg">
        <div className="flex h-14 items-center px-[11px]">
          <IconButton label="Leave scorecard" onClick={() => nav("/")}>
            <ChevronLeft size={24} />
          </IconButton>
          <div className="min-w-0 flex-1 px-1">
            <div className="truncate text-[14px] font-extrabold">
              {round.courseName}
              {round.layoutName && <span className="font-semibold text-ink-3"> · {round.layoutName}</span>}
            </div>
            <div className="label mt-1 text-ink-3">
              {holesComplete.size} of {order.length} holes scored
            </div>
          </div>
          <IconButton label={showMap ? "Hide map" : "Show map"} onClick={() => setShowMap((v) => !v)} className={cx(showMap && "bg-surface-2 text-lime")}>
            <MapIcon size={22} />
          </IconButton>
          <IconButton label="Round options" onClick={() => setMenuOpen(true)}>
            <MoreHorizontal size={24} />
          </IconButton>
        </div>

        {/* Hole overlay: the lime timing bar. */}
        <div key={holeNumber} className="overlay-in mx-[11px] rounded-[14px] bg-lime px-[22px] pb-[15px] pt-[11px] text-on-lime">
          <div className="flex items-end justify-between gap-[11px]">
            <div>
              <div className="label">Hole</div>
              <div className="display text-[84px] leading-[0.8]">{holeNumber ?? "–"}</div>
            </div>
            <div className="flex gap-[22px] pb-1 text-right">
              <div>
                <div className="label">Par</div>
                <div className="display numeric mt-1 text-[36px]">{par}</div>
              </div>
              {hole?.distanceM ? (
                <div>
                  <div className="label">Length</div>
                  <div className="display numeric mt-1 text-[36px]">{formatHoleDistance(hole.distanceM, units)}</div>
                </div>
              ) : null}
              <div>
                <div className="label flex items-center justify-end gap-1">
                  <Crosshair size={11} /> Basket
                </div>
                <div className={cx("display numeric mt-1 text-[36px]", distanceToBasket === null && "opacity-40")}>{distanceToBasket !== null ? formatHoleDistance(distanceToBasket, units) : "–"}</div>
              </div>
            </div>
          </div>
          <div className="mt-[11px] flex items-center gap-2">
            <button
              onClick={() => markHere("tee")}
              className={cx("label flex h-8 items-center gap-1 rounded-[39px] border-2 border-on-lime px-3 uppercase", hole?.tee ? "bg-on-lime text-lime" : "bg-transparent text-on-lime")}
              aria-label={hole?.tee ? "Re-mark tee at my position" : "Mark tee at my position"}
            >
              <Crosshair size={12} /> {hole?.tee ? "Tee set" : "Tee here"}
            </button>
            <button
              onClick={() => markHere("basket")}
              className={cx("label flex h-8 items-center gap-1 rounded-[39px] border-2 border-on-lime px-3 uppercase", hole?.basket ? "bg-on-lime text-lime" : "bg-transparent text-on-lime")}
              aria-label={hole?.basket ? "Re-mark basket at my position" : "Mark basket at my position"}
            >
              <Crosshair size={12} /> {hole?.basket ? "Basket set" : "Basket here"}
            </button>
            <span className="label ml-auto opacity-70">{geo.position ? `GPS ±${Math.round(formatAccuracyFt(geo.position.accuracy))} ft` : "No GPS"}</span>
          </div>
        </div>
        <div className="flex gap-[6px] overflow-x-auto px-[11px] py-[11px] [scrollbar-width:none]">
          {order.map((n, i) => (
            <button
              key={n}
              onClick={() => setIdx(i)}
              className={cx(
                "numeric h-8 w-8 shrink-0 rounded-full border-2 text-[12px] font-extrabold transition-colors duration-150 ease",
                i === idx ? "border-lime bg-lime text-on-lime" : holesComplete.has(n) ? "border-lime bg-transparent text-lime" : "border-line-strong bg-transparent text-ink-3",
              )}
              aria-current={i === idx ? "step" : undefined}
            >
              {n}
            </button>
          ))}
        </div>
      </header>

      {showMap && course && (
        <CourseMap center={course} holes={holes} activeHole={holeNumber} user={geo.position} satellite={satellite} onSatelliteChange={(v) => setSetting("satellite", v)} fitOn="active" className="h-[30dvh] shrink-0">
          {!hole?.tee && <div className="absolute bottom-2 left-2 rounded-full bg-surface px-3 py-1.5 text-xs font-medium shadow-card">This hole has no map position yet</div>}
        </CourseMap>
      )}

      <div className="flex-1 px-[11px] pt-[11px] pb-32">
        <div className="overflow-hidden rounded-[14px] bg-surface">
          {cardPlayers.map((p) => {
            const s = holeScores.find((x) => x.playerId === p.id);
            const t = totals.get(p.id);
            if (!s) return null;
            const label = scoreLabel(s.strokes, s.par);
            return (
              <div key={p.id} className="flex items-center gap-2 border-b hairline px-[11px] py-[11px] last:border-b-0">
                <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => round.trackThrows && setTrackerFor(p.id)} aria-label={round.trackThrows ? `Track throws for ${p.name}` : p.name}>
                  <Avatar name={p.name} color={p.color} size={38} />
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-extrabold">{p.name}</div>
                    <div className="label numeric mt-1.5 text-ink-3">
                      {t && t.holesScored > 0 ? (
                        <>
                          <span className={cx(t.toPar < 0 ? "text-lime" : t.toPar > 0 ? "text-ink" : "text-ink-2")}>{formatToPar(t.toPar)}</span> · {t.strokes} after {t.holesScored}
                        </>
                      ) : (
                        "no holes yet"
                      )}
                      {round.trackThrows && s.throws && s.throws.length > 0 && <span className="ml-1 text-lime">· {s.throws.length} throws</span>}
                    </div>
                  </div>
                </button>
                <button aria-label={`Remove a stroke for ${p.name}`} onClick={() => adjustStrokes(s.id, -1)} disabled={s.strokes === 1} className="grid h-12 w-12 place-items-center rounded-full border-2 border-ink text-ink active:bg-surface-3 disabled:opacity-30">
                  <Minus size={22} strokeWidth={2.6} />
                </button>
                <div key={`${s.id}-${s.strokes}`} className={cx("display numeric strike w-14 text-center text-[44px]", label === "birdie" || label === "eagle" || label === "ace" ? "text-lime" : label === "double" || label === "triple" ? "text-triple" : "text-ink")} aria-live="polite" aria-label={`${p.name} strokes`}>
                  {s.strokes > 0 ? s.strokes : "–"}
                </div>
                <button aria-label={`Add a stroke for ${p.name}`} onClick={() => adjustStrokes(s.id, 1)} className="grid h-12 w-12 place-items-center rounded-full bg-lime text-on-lime active:bg-lime-2">
                  <Plus size={22} strokeWidth={2.6} />
                </button>
              </div>
            );
          })}
        </div>
        <p className="label mt-[11px] px-[11px] normal-case text-ink-3">
          {round.trackThrows ? "Tap a name to log where each throw landed. " : ""}On a new hole, + sets par and − sets a birdie. Then each tap moves one stroke.
        </p>
      </div>

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 flex justify-center border-t border-lime/30 bg-surface">
        <div className="flex w-full max-w-[480px] items-center gap-2 px-[11px] py-[11px]">
          <Button size="lg" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} aria-label="Previous hole" className="w-14 px-0">
            <ChevronLeft size={24} />
          </Button>
          {idx >= order.length - 1 || allDone ? (
            <Button variant="primary" size="lg" className="flex-1" onClick={() => setFinishOpen(true)}>
              <Flag size={18} /> Finish round
            </Button>
          ) : (
            <Button variant="primary" size="lg" className="flex-1" onClick={() => setIdx((i) => Math.min(order.length - 1, i + 1))}>
              Next hole <ChevronRight size={20} />
            </Button>
          )}
          {idx < order.length - 1 && allDone && (
            <Button size="lg" onClick={() => setIdx((i) => i + 1)} aria-label="Next hole" className="w-14 px-0">
              <ChevronRight size={24} />
            </Button>
          )}
        </div>
      </div>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Round options">
        <div className="divide-y hairline">
          <MenuItem icon={<Target size={18} />} label={`Change par for hole ${holeNumber}`} onClick={() => (setMenuOpen(false), setParOpen(true))} />
          <MenuItem icon={<UserPlus size={18} />} label="Add or remove players" onClick={() => (setMenuOpen(false), setPlayersOpen(true))} />
          <MenuItem icon={<ListX size={18} />} label={`Fix hole count (${holes.length} holes)`} onClick={() => (setMenuOpen(false), setHoleCountInput(String(holes.length)), setHolesOpen(true))} />
          <MenuItem icon={<Flag size={18} />} label="Finish round" onClick={() => (setMenuOpen(false), setFinishOpen(true))} />
          <MenuItem icon={<Trash2 size={18} />} label="Delete round" danger onClick={() => (setMenuOpen(false), confirm("Delete this round for everyone on the card?") && remove())} />
        </div>
      </Sheet>

      <Sheet open={parOpen} onClose={() => setParOpen(false)} title={`Par for hole ${holeNumber}`}>
        <div className="flex justify-center gap-2 py-2">
          {[2, 3, 4, 5, 6].map((p) => (
            <button
              key={p}
              onClick={async () => {
                await setHolePar(round.id, holeNumber, p);
                setParOpen(false);
              }}
              className={cx("display numeric h-14 w-14 rounded-full text-2xl border-2", p === par ? "border-lime bg-lime text-on-lime" : "border-line-strong bg-transparent text-ink")}
            >
              {p}
            </button>
          ))}
        </div>
        <p className="text-center text-xs text-ink-3">Applies to this round only.</p>
      </Sheet>

      <Sheet open={playersOpen} onClose={() => setPlayersOpen(false)} title="Players on this card">
        <div className="divide-y hairline">
          {cardPlayers.map((p) => (
            <div key={p.id} className="flex items-center gap-3 py-2.5">
              <Avatar name={p.name} color={p.color} size={32} />
              <span className="flex-1 font-medium">{p.name}</span>
              {!p.isMe && cardPlayers.length > 1 && (
                <IconButton label={`Remove ${p.name}`} onClick={() => removePlayerFromRound(round, p.id)}>
                  <UserMinus size={18} />
                </IconButton>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4">
          <div className="mb-2 text-sm font-medium text-ink-2">Add someone</div>
          <div className="flex flex-wrap gap-2">
            {players
              .filter((p) => !round.playerIds.includes(p.id))
              .map((p) => (
                <Button key={p.id} size="sm" onClick={() => addPlayerToRound(round, p.id)}>
                  <Plus size={14} /> {p.name}
                </Button>
              ))}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!guestName.trim()) return;
              const p = await createPlayer(guestName);
              await addPlayerToRound(round, p.id);
              setGuestName("");
            }}
          >
            <Field name="newp" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="New player name" className="flex-1" />
            <Button type="submit" variant="brand" className="h-12" disabled={!guestName.trim()}>
              Add
            </Button>
          </form>
        </div>
      </Sheet>

      <Sheet open={finishOpen} onClose={() => setFinishOpen(false)} title="Finish round?">
        {!allDone && <p className="mb-3 rounded-card bg-surface-2 px-3 py-2 text-sm text-ink-2">Some holes have no score yet. They will be left out of totals and stats.</p>}
        <div className="divide-y hairline rounded-card bg-surface-2 px-3">
          {cardPlayers.map((p) => {
            const t = totals.get(p.id);
            return (
              <div key={p.id} className="flex items-center justify-between py-2.5">
                <span className="font-medium">{p.name}</span>
                <span className="numeric font-bold">{t && t.holesScored ? `${t.strokes} (${formatToPar(t.toPar)})` : "–"}</span>
              </div>
            );
          })}
        </div>
        <Button variant="primary" size="lg" full className="mt-4" onClick={finish}>
          <Flag size={18} /> Finish and save
        </Button>
        <Button variant="ghost" full className="mt-2" onClick={() => setFinishOpen(false)}>
          Keep scoring
        </Button>
      </Sheet>

      <Sheet open={confirmMark !== null} onClose={() => setConfirmMark(null)} title={`Replace the ${confirmMark ?? ""} for hole ${holeNumber}?`}>
        <p className="text-sm text-ink-2">This hole already has a {confirmMark} position, shared with other players. Replace it with where you are standing now?</p>
        <div className="mt-4 flex gap-2">
          <Button className="flex-1" onClick={() => setConfirmMark(null)}>
            Keep it
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => {
              const what = confirmMark!;
              setConfirmMark(null);
              void markHere(what, true);
            }}
          >
            Replace
          </Button>
        </div>
      </Sheet>

      <Sheet open={holesOpen} onClose={() => setHolesOpen(false)} title="Fix this course's holes">
        <p className="text-sm text-ink-2">Course data is often wrong about hole counts. Changes here apply to {round.layoutName ? `the ${round.layoutName} layout` : "the course"} for everyone and to this round.</p>
        <div className="mt-4 rounded-card bg-surface-2 p-3">
          <div className="text-sm font-semibold">Remove hole {holeNumber}</div>
          <p className="mt-1 text-xs text-ink-3">Later holes move up one number.</p>
          <Button
            variant="danger"
            size="sm"
            className="mt-2"
            disabled={holes.length <= 1}
            onClick={async () => {
              if (!course) return;
              await removeHole(course.id, holeNumber, layoutId);
              await publishCourseNow(course.id);
              setHolesOpen(false);
              setIdx((i) => Math.min(i, Math.max(0, order.length - 2)));
              notify(`Hole ${holeNumber} removed`);
            }}
          >
            <Trash2 size={14} /> Remove hole {holeNumber}
          </Button>
        </div>
        <form
          className="mt-3 rounded-card bg-surface-2 p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!course) return;
            const n = Number(holeCountInput);
            if (!Number.isFinite(n) || n < 1 || n > 36) return;
            await setHoleCount(course.id, n, layoutId);
            await publishCourseNow(course.id);
            setHolesOpen(false);
            setIdx((i) => Math.min(i, Math.max(0, n - 1)));
            notify(`Course set to ${n} holes`);
          }}
        >
          <div className="text-sm font-semibold">Total holes on this course</div>
          <p className="mt-1 text-xs text-ink-3">Extra holes come off the end; missing ones are added as par 3.</p>
          <div className="mt-2 flex gap-2">
            <Field name="holeCount" type="number" inputMode="numeric" min={1} max={36} value={holeCountInput} onChange={(e) => setHoleCountInput(e.target.value)} className="h-11 w-24" />
            <Button type="submit" variant="brand" className="h-11">
              Set
            </Button>
          </div>
        </form>
      </Sheet>

      <Sheet open={!!trackerFor && !!trackerScore} onClose={() => setTrackerFor(null)} title={`${trackerPlayer?.name ?? ""} · hole ${holeNumber}`} tall>
        {trackerScore && <ThrowTracker score={trackerScore} par={par} onDone={() => setTrackerFor(null)} />}
      </Sheet>
      <Toast message={toast} />
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cx("flex w-full items-center gap-3 py-3.5 text-left font-medium", danger ? "text-danger" : "text-ink")}>
      {icon} {label}
    </button>
  );
}

function ThrowTracker({ score, par, onDone }: { score: HoleScore; par: number; onDone: () => void }) {
  const throws = score.throws ?? [];
  const holed = isHoledOut(throws);
  const n = throws.length + 1;

  async function add(zone: Zone) {
    if (holed) return;
    await setThrows(score.id, [...throws, zone]);
  }
  async function undo() {
    await setThrows(score.id, throws.slice(0, -1));
  }

  return (
    <div className="pb-2">
      <div className="flex items-center justify-between">
        <div className="text-sm text-ink-2">
          {holed ? "Holed out" : `Where did throw ${n} land?`}
        </div>
        <div className="display numeric text-[28px]">
          {score.strokes || "–"} <span className="text-base text-ink-3">/ par {par}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {throws.length === 0 && <span className="text-xs text-ink-3">No throws yet</span>}
        {throws.map((z, i) => (
          <span key={i} className={cx("numeric rounded-full px-2.5 py-1 text-xs font-semibold", z === "ob" ? "bg-danger/15 text-danger" : z === "basket" ? "bg-ace/15 text-ace" : "bg-surface-2 text-ink-2")}>
            {i + 1}. {ZONES.find((x) => x.zone === z)?.label ?? "In the basket"}
          </span>
        ))}
      </div>

      {!holed && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {ZONES.map((z) => (
            <button key={z.zone} onClick={() => add(z.zone)} className={cx("rounded-[6px] border px-3 py-3 text-left active:bg-surface-3", z.zone === "ob" ? "border-danger bg-transparent" : "border-line-strong bg-surface-2")}>
              <div className="font-semibold">{z.label}</div>
              <div className="text-[11px] text-ink-3">{z.hint}</div>
            </button>
          ))}
          <button onClick={() => add("basket")} className="label col-span-2 rounded-[39px] bg-lime px-3 py-[15px] text-center text-[14px] uppercase text-on-lime active:bg-lime-2">
            In the basket
          </button>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Button onClick={undo} disabled={throws.length === 0} className="flex-1">
          <Undo2 size={16} /> Undo
        </Button>
        <Button variant="brand" onClick={onDone} className="flex-1">
          Done
        </Button>
      </div>
    </div>
  );
}
