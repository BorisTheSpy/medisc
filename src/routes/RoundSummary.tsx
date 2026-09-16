import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Share2, Trash2, Play, Trophy, Pencil } from "lucide-react";
import { useCourse, usePlayers, useRound, useRoundScores } from "@/db/hooks";
import { deleteRound, reopenRound, updateRound } from "@/db/repo";
import { formatToPar, roundTotals } from "@/domain/scoring";
import { throwStats } from "@/domain/stats";
import { formatRoundDate } from "@/lib/format";
import { pct } from "@/lib/format";
import { Avatar, Button, Field, IconButton, PageHeader, ScoreCell, Section, Sheet, Spinner, StatTile, cx } from "@/components/ui";
import type { Player } from "@/domain/types";

export function RoundSummaryRoute() {
  const { id } = useParams();
  const nav = useNavigate();
  const round = useRound(id);
  const scores = useRoundScores(id);
  const players = usePlayers();
  const course = useCourse(round?.courseId);
  const [nameOpen, setNameOpen] = useState(false);
  const [name, setName] = useState("");

  const totals = useMemo(() => roundTotals(scores), [scores]);
  const cardPlayers = useMemo(() => (round ? round.playerIds.map((pid) => players.find((p) => p.id === pid)).filter((p): p is Player => !!p) : []), [round, players]);
  const ranked = useMemo(
    () =>
      [...cardPlayers].sort((a, b) => {
        const ta = totals.get(a.id);
        const tb = totals.get(b.id);
        if (!ta?.holesScored) return 1;
        if (!tb?.holesScored) return -1;
        return ta.toPar - tb.toPar;
      }),
    [cardPlayers, totals],
  );
  const order = useMemo(() => {
    if (!round) return [];
    const nums = round.holeNumbers;
    const startIdx = Math.max(0, nums.indexOf(round.startingHole));
    return [...nums.slice(startIdx), ...nums.slice(0, startIdx)];
  }, [round]);
  const parByHole = useMemo(() => new Map(scores.map((s) => [s.holeNumber, s.par])), [scores]);
  const tracked = useMemo(() => (round ? cardPlayers.map((p) => ({ p, t: throwStats([round], scores, p.id) })).filter((x) => x.t.holesTracked > 0) : []), [round, scores, cardPlayers]);

  if (round === undefined) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner />
      </div>
    );
  }
  if (round === null) {
    return <PageHeader title="Round not found" back={() => nav("/rounds")} />;
  }

  const winner = ranked[0];
  const winnerTotal = totals.get(winner?.id ?? "");
  const tie = ranked.length > 1 && totals.get(ranked[1].id)?.toPar === winnerTotal?.toPar && !!totals.get(ranked[1].id)?.holesScored;

  async function share() {
    const lines = [`${round!.courseName} · ${formatRoundDate(round!.startedAt)}`];
    for (const p of ranked) {
      const t = totals.get(p.id);
      lines.push(`${p.name}: ${t && t.holesScored ? `${t.strokes} (${formatToPar(t.toPar)})` : "–"}`);
    }
    lines.push("Scored with Medisc");
    const text = lines.join("\n");
    try {
      if (navigator.share) await navigator.share({ title: `${round!.courseName} scorecard`, text });
      else {
        await navigator.clipboard.writeText(text);
        alert("Scorecard copied to clipboard.");
      }
    } catch {
      /* cancelled */
    }
  }

  async function remove() {
    if (!confirm("Delete this round? This cannot be undone.")) return;
    await deleteRound(round!.id);
    nav("/rounds", { replace: true });
  }

  async function continueScoring() {
    await reopenRound(round!.id);
    nav(`/rounds/${round!.id}/play`, { replace: true });
  }

  return (
    <div>
      <PageHeader
        title={round.name ?? round.courseName}
        sub={`${round.name ? round.courseName + " · " : ""}${formatRoundDate(round.startedAt)}`}
        back={() => nav(-1)}
        right={
          <>
            <IconButton
              label="Name this round"
              onClick={() => {
                setName(round.name ?? "");
                setNameOpen(true);
              }}
            >
              <Pencil size={20} />
            </IconButton>
            <IconButton label="Share" onClick={share}>
              <Share2 size={20} />
            </IconButton>
          </>
        }
      />

      {!round.finishedAt && (
        <div className="mx-4 mb-3 flex items-center justify-between rounded-card bg-brand px-4 py-3 text-brand-ink">
          <span className="text-sm font-semibold">This round is still open</span>
          <Button variant="primary" size="sm" onClick={() => nav(`/rounds/${round.id}/play`)}>
            <Play size={14} fill="currentColor" /> Resume
          </Button>
        </div>
      )}

      <Section>
        <div className="overflow-hidden rounded-card bg-surface shadow-card">
          {ranked.map((p, i) => {
            const t = totals.get(p.id);
            const isWinner = i === 0 && ranked.length > 1 && !!t?.holesScored;
            return (
              <div key={p.id} className="flex items-center gap-3 border-b hairline px-4 py-3 last:border-b-0">
                <Avatar name={p.name} color={p.color} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-semibold">
                    {p.name}
                    {isWinner && <Trophy size={16} className="text-accent" aria-label={tie ? "Tied for first" : "Winner"} />}
                  </div>
                  <div className="numeric text-xs text-ink-3">{t && t.holesScored ? `${t.strokes} strokes · ${t.holesScored} holes` : "No holes scored"}</div>
                </div>
                <div className={cx("display numeric text-[34px]", t && t.holesScored && t.toPar < 0 ? "text-birdie" : t && t.toPar > 0 ? "text-triple" : "")}>{t && t.holesScored ? formatToPar(t.toPar) : "–"}</div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Scorecard" className="mt-6">
        <div className="overflow-x-auto rounded-card bg-surface shadow-card">
          <table className="numeric w-full border-collapse text-sm">
            <thead>
              <tr className="text-[11px] text-ink-3">
                <th className="sticky left-0 bg-surface px-3 py-2 text-left font-semibold">Hole</th>
                {order.map((n) => (
                  <th key={n} className="px-1 py-2 text-center font-semibold">
                    {n}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-semibold">Total</th>
              </tr>
              <tr className="text-[11px] text-ink-3">
                <th className="sticky left-0 bg-surface px-3 py-1 text-left font-semibold">Par</th>
                {order.map((n) => (
                  <th key={n} className="px-1 py-1 text-center font-semibold">
                    {parByHole.get(n) ?? "–"}
                  </th>
                ))}
                <th className="px-3 py-1 text-right font-semibold">{order.reduce((a, n) => a + (parByHole.get(n) ?? 0), 0)}</th>
              </tr>
            </thead>
            <tbody>
              {cardPlayers.map((p) => {
                const t = totals.get(p.id);
                return (
                  <tr key={p.id} className="border-t hairline">
                    <td className="sticky left-0 bg-surface px-3 py-1.5 font-semibold">{p.name.split(" ")[0]}</td>
                    {order.map((n) => {
                      const s = scores.find((x) => x.playerId === p.id && x.holeNumber === n);
                      return (
                        <td key={n} className="px-0.5 py-1.5 text-center">
                          {s && <ScoreCell strokes={s.strokes} par={s.par} size={28} className="mx-auto" />}
                        </td>
                      );
                    })}
                    <td className="px-3 py-1.5 text-right font-bold">{t && t.holesScored ? t.strokes : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {tracked.length > 0 && (
        <Section title="Throw stats" className="mt-6">
          {tracked.map(({ p, t }) => (
            <div key={p.id} className="mb-3">
              {tracked.length > 1 && <div className="mb-1.5 text-sm font-semibold text-ink-2">{p.name}</div>}
              <div className="grid grid-cols-3 gap-2">
                <StatTile label="Fairway hit" value={pct(t.fairwayHit)} />
                <StatTile label="C1 in reg" value={pct(t.c1InReg)} />
                <StatTile label="C2 in reg" value={pct(t.c2InReg)} />
                <StatTile label="C1 putting" value={t.c1Putting.attempts ? pct(t.c1Putting.made / t.c1Putting.attempts) : "–"} sub={`${t.c1Putting.made}/${t.c1Putting.attempts}`} />
                <StatTile label="C2 putting" value={t.c2Putting.attempts ? pct(t.c2Putting.made / t.c2Putting.attempts) : "–"} sub={`${t.c2Putting.made}/${t.c2Putting.attempts}`} />
                <StatTile label="OB rate" value={pct(t.obRate)} tone={t.obRate > 0.2 ? "bad" : undefined} />
              </div>
            </div>
          ))}
        </Section>
      )}

      <Section className="mt-6 mb-6">
        <div className="flex gap-2">
          {round.finishedAt && (
            <Button className="flex-1" onClick={continueScoring}>
              <Play size={16} /> Edit scores
            </Button>
          )}
          <Button variant="ghost" className="flex-1 text-danger" onClick={remove}>
            <Trash2 size={16} /> Delete round
          </Button>
        </div>
        {course && (
          <button className="mt-4 w-full text-center text-sm font-semibold text-birdie" onClick={() => nav(`/courses/${course.id}`)}>
            Open {course.name}
          </button>
        )}
      </Section>

      <Sheet open={nameOpen} onClose={() => setNameOpen(false)} title="Name this round">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await updateRound(round.id, { name: name.trim() || undefined });
            setNameOpen(false);
          }}
        >
          <Field name="rname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sunday dubs, windy as hell" maxLength={60} autoFocus />
          <Button type="submit" variant="primary" size="lg" full className="mt-4">
            Save
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
