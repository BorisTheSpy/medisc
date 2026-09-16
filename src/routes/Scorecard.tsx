import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ChevronLeft, ChevronRight, Map as MapIcon, MoreHorizontal, Minus, Plus, Flag, Trash2, UserPlus, UserMinus, Undo2, Target, Crosshair } from "lucide-react";
import { useCourse, useHoles, usePlayers, useRound, useRoundScores, useSetting } from "@/db/hooks";
import { addPlayerToRound, adjustStrokes, createPlayer, deleteRound, finishRound, removePlayerFromRound, setHolePar, setSetting, setThrows } from "@/db/repo";
import { useGeolocation } from "@/services/useGeolocation";
import { formatHoleDistance, haversineM, type Units } from "@/domain/geo";
import { formatToPar, roundTotals, scoreLabel, isHoledOut } from "@/domain/scoring";
import type { HoleScore, Player, Zone } from "@/domain/types";
import { Avatar, Button, Field, IconButton, Sheet, Spinner, cx } from "@/components/ui";
import { CourseMap } from "@/map/CourseMap";

const ZONES: { zone: Zone; label: string; hint: string }[] = [
  { zone: "fairway", label: "Fairway", hint: "In play, outside circle 2" },
  { zone: "off_fairway", label: "Off fairway", hint: "Rough, trees, still in bounds" },
  { zone: "c2", label: "Circle 2", hint: "33–66 ft from the basket" },
  { zone: "c1", label: "Circle 1", hint: "Inside 33 ft" },
  { zone: "parked", label: "Parked", hint: "Inside 10 ft, a tap-in" },
  { zone: "ob", label: "OB", hint: "Out of bounds, +1 penalty" },
];

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
  const holes = useHoles(round?.courseId);
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
      <header className="safe-top sticky top-0 z-20 bg-brand text-brand-ink">
        <div className="flex h-14 items-center px-2">
          <IconButton label="Leave scorecard" onClick={() => nav("/")} className="text-brand-ink hover:bg-brand-2">
            <ChevronLeft size={24} />
          </IconButton>
          <div className="min-w-0 flex-1 px-1">
            <div className="truncate text-sm font-semibold">{round.courseName}</div>
            <div className="text-[11px] text-brand-ink/70">
              {holesComplete.size} of {order.length} holes scored
            </div>
          </div>
          <IconButton label={showMap ? "Hide map" : "Show map"} onClick={() => setShowMap((v) => !v)} className={cx("text-brand-ink hover:bg-brand-2", showMap && "bg-brand-2")}>
            <MapIcon size={22} />
          </IconButton>
          <IconButton label="Round options" onClick={() => setMenuOpen(true)} className="text-brand-ink hover:bg-brand-2">
            <MoreHorizontal size={24} />
          </IconButton>
        </div>

        <div className="flex items-end justify-between px-5 pb-4 pt-1">
          <div>
            <div className="text-[13px] font-medium text-brand-ink/70">Hole</div>
            <div className="display text-[64px] leading-none">{holeNumber ?? "–"}</div>
          </div>
          <div className="flex gap-5 pb-1 text-right">
            <div>
              <div className="text-[13px] font-medium text-brand-ink/70">Par</div>
              <div className="display numeric text-[34px]">{par}</div>
            </div>
            {hole?.distanceM ? (
              <div>
                <div className="text-[13px] font-medium text-brand-ink/70">Length</div>
                <div className="display numeric text-[34px]">{formatHoleDistance(hole.distanceM, units)}</div>
              </div>
            ) : null}
            <div>
              <div className="flex items-center justify-end gap-1 text-[13px] font-medium text-brand-ink/70">
                <Crosshair size={12} /> To basket
              </div>
              <div className={cx("display numeric text-[34px]", distanceToBasket === null && "text-brand-ink/40")}>{distanceToBasket !== null ? formatHoleDistance(distanceToBasket, units) : "–"}</div>
            </div>
          </div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
          {order.map((n, i) => (
            <button
              key={n}
              onClick={() => setIdx(i)}
              className={cx(
                "numeric h-8 w-8 shrink-0 rounded-full text-sm font-bold",
                i === idx ? "bg-accent text-accent-ink" : holesComplete.has(n) ? "bg-brand-2 text-brand-ink" : "bg-brand-2/50 text-brand-ink/60",
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

      <div className="flex-1 px-3 pt-3 pb-32">
        <div className="overflow-hidden rounded-card bg-surface shadow-card">
          {cardPlayers.map((p) => {
            const s = holeScores.find((x) => x.playerId === p.id);
            const t = totals.get(p.id);
            if (!s) return null;
            const label = scoreLabel(s.strokes, s.par);
            return (
              <div key={p.id} className="flex items-center gap-2 border-b hairline px-3 py-2.5 last:border-b-0">
                <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => round.trackThrows && setTrackerFor(p.id)} aria-label={round.trackThrows ? `Track throws for ${p.name}` : p.name}>
                  <Avatar name={p.name} color={p.color} size={38} />
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{p.name}</div>
                    <div className="numeric text-xs text-ink-3">
                      {t && t.holesScored > 0 ? (
                        <>
                          <span className={cx("font-bold", t.toPar < 0 ? "text-birdie" : t.toPar > 0 ? "text-triple" : "text-ink-2")}>{formatToPar(t.toPar)}</span> · {t.strokes} after {t.holesScored}
                        </>
                      ) : (
                        "no holes yet"
                      )}
                      {round.trackThrows && s.throws && s.throws.length > 0 && <span className="ml-1 text-birdie">· {s.throws.length} throws logged</span>}
                    </div>
                  </div>
                </button>
                <button aria-label={`Remove a stroke for ${p.name}`} onClick={() => adjustStrokes(s.id, -1)} disabled={s.strokes === 1} className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-ink active:bg-surface-3 disabled:opacity-30">
                  <Minus size={22} />
                </button>
                <div className={cx("display numeric w-12 text-center text-[36px]", label === "birdie" || label === "eagle" || label === "ace" ? "text-birdie" : label === "bogey" || label === "double" || label === "triple" ? "text-triple" : "")} aria-live="polite" aria-label={`${p.name} strokes`}>
                  {s.strokes > 0 ? s.strokes : "–"}
                </div>
                <button aria-label={`Add a stroke for ${p.name}`} onClick={() => adjustStrokes(s.id, 1)} className="grid h-12 w-12 place-items-center rounded-full bg-accent text-accent-ink active:bg-accent-2">
                  <Plus size={22} />
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-2 px-1 text-xs text-ink-3">
          {round.trackThrows ? "Tap a name to log where each throw landed. " : ""}On a new hole, + sets par and − sets a birdie. Then each tap moves one stroke.
        </p>
      </div>

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 flex justify-center border-t hairline bg-surface/95 backdrop-blur">
        <div className="flex w-full max-w-[480px] items-center gap-2 px-3 py-3">
          <Button size="lg" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} aria-label="Previous hole" className="w-14 px-0">
            <ChevronLeft size={24} />
          </Button>
          {idx >= order.length - 1 || allDone ? (
            <Button variant="primary" size="lg" className="flex-1" onClick={() => setFinishOpen(true)}>
              <Flag size={18} /> Finish round
            </Button>
          ) : (
            <Button variant="brand" size="lg" className="flex-1" onClick={() => setIdx((i) => Math.min(order.length - 1, i + 1))}>
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
              className={cx("display numeric h-14 w-14 rounded-full text-2xl", p === par ? "bg-brand text-brand-ink" : "bg-surface-2")}
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

      <Sheet open={!!trackerFor && !!trackerScore} onClose={() => setTrackerFor(null)} title={`${trackerPlayer?.name ?? ""} · hole ${holeNumber}`} tall>
        {trackerScore && <ThrowTracker score={trackerScore} par={par} onDone={() => setTrackerFor(null)} />}
      </Sheet>
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
            <button key={z.zone} onClick={() => add(z.zone)} className={cx("rounded-card px-3 py-3 text-left active:bg-surface-3", z.zone === "ob" ? "bg-danger/10" : "bg-surface-2")}>
              <div className="font-semibold">{z.label}</div>
              <div className="text-[11px] text-ink-3">{z.hint}</div>
            </button>
          ))}
          <button onClick={() => add("basket")} className="col-span-2 rounded-card bg-ace px-3 py-4 text-center text-lg font-bold text-white active:opacity-90">
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
