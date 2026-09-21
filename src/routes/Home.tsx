import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Play, Settings, ChevronRight } from "lucide-react";
import { useAllScores, useLiveRound, useMe, usePlayers, useRounds } from "@/db/hooks";
import { overview, weeklyStreak } from "@/domain/stats";
import { roundTotals, formatToPar } from "@/domain/scoring";
import { formatRoundDate } from "@/lib/format";
import { Button, IconButton, Section, EmptyState, cx } from "@/components/ui";
import { mergePlayerInto } from "@/db/repo";
import { Logo } from "@/components/Logo";
import { RoundRow } from "@/components/RoundRow";

export function HomeRoute() {
  const nav = useNavigate();
  const me = useMe();
  const rounds = useRounds();
  const scores = useAllScores();
  const players = usePlayers();
  const live = useLiveRound();

  const finished = useMemo(() => rounds.filter((r) => r.finishedAt), [rounds]);
  const [dismissed, setDismissed] = useState(false);
  // Rounds that list another player but not me, e.g. after a UDisc import: offer to claim them.
  const orphan = useMemo(() => {
    if (!me || dismissed) return null;
    const mineCount = finished.filter((r) => r.playerIds.includes(me.id)).length;
    const counts = new Map<string, number>();
    for (const r of finished) if (!r.playerIds.includes(me.id)) for (const id of r.playerIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!top || top[1] === 0 || (mineCount > 0 && top[1] < mineCount)) return null;
    const player = players.find((p) => p.id === top[0] && !p.deletedAt);
    return player ? { player, count: top[1] } : null;
  }, [me, finished, players, dismissed]);
  const stats = useMemo(() => (me ? overview(finished, scores, me.id) : null), [finished, scores, me]);
  const streak = useMemo(() => weeklyStreak(finished), [finished]);
  const liveTotals = useMemo(() => (live ? roundTotals(scores.filter((s) => s.roundId === live.id)) : null), [live, scores]);
  const liveMine = live && me ? liveTotals?.get(me.id) : undefined;
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Late night" : hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
  const first = me?.name.split(" ")[0] ?? "";

  return (
    <div>
      <header className="safe-top px-[22px] pt-[22px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-[11px]">
            <Logo size={30} />
            <span className="label text-ink">Medisc</span>
          </div>
          <IconButton label="Settings" onClick={() => nav("/settings")}>
            <Settings size={22} />
          </IconButton>
        </div>
        <h1 className="display mt-[33px] text-[46px] text-ink">
          {greeting},
          <br />
          {first}.
        </h1>
        <p className="label mt-[11px] text-ink-3">
          {streak > 0 ? `${streak} week streak` : "No streak yet"}
          {stats && stats.rounds > 0 ? ` · ${stats.rounds} rounds` : ""}
        </p>
      </header>

      {orphan && (
        <div className="mt-[22px] px-[22px]">
          <div className="rounded-[14px] border border-live bg-surface p-[22px]">
            <div className="display text-[24px]">
              {orphan.count} {orphan.count === 1 ? "round lists" : "rounds list"} “{orphan.player.name}”, not you
            </div>
            <p className="mt-[11px] text-[14px] font-medium text-ink-2">If that's you under another name, claim those rounds and they count toward your stats.</p>
            <div className="mt-[22px] flex gap-[11px]">
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  if (!me) return;
                  await mergePlayerInto(orphan.player.id, me.id, { name: me.name, color: me.color, isMe: true });
                }}
              >
                Yes, that's me
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
                Someone else
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-[22px] px-[22px]">
        {live ? (
          <button onClick={() => nav(`/rounds/${live.id}/play`)} className="block w-full rounded-[39px] bg-live px-[22px] py-[22px] text-left text-on-live active:bg-live-2">
            <div className="flex items-center justify-between">
              <span className="label flex items-center gap-2">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-on-live" /> Live round
              </span>
              <ChevronRight size={20} />
            </div>
            <div className="display mt-[11px] truncate text-[30px]">{live.courseName}</div>
            {live.layoutName && <div className="label mt-1 text-on-live opacity-70">{live.layoutName}</div>}
            <div className="mt-[22px] flex items-end justify-between gap-[11px]">
              <div className="flex flex-wrap gap-1.5">
                {live.playerIds.map((id) => {
                  const p = players.find((x) => x.id === id);
                  const t = liveTotals?.get(id);
                  return (
                    <span key={id} className="label rounded-[39px] border border-on-live/40 px-2.5 py-1.5">
                      {p?.name.split(" ")[0] ?? "?"} {t && t.holesScored ? formatToPar(t.toPar) : "–"}
                    </span>
                  );
                })}
              </div>
              <span className="display numeric text-[56px] leading-none">{liveMine && liveMine.holesScored ? formatToPar(liveMine.toPar) : "–"}</span>
            </div>
          </button>
        ) : (
          <Button variant="primary" size="lg" full onClick={() => nav("/play")}>
            <Play size={18} fill="currentColor" /> Start a round
          </Button>
        )}
      </div>

      {stats && stats.rounds > 0 && (
        <div className="mt-[22px] px-[22px]">
          <div className="grid grid-cols-4 divide-x divide-line rounded-[6px] bg-surface py-[11px]">
            <Quick label="Rounds" value={stats.rounds} />
            <Quick label="Courses" value={stats.coursesPlayed} />
            <Quick label="Best" value={stats.bestToPar === null ? "–" : formatToPar(stats.bestToPar)} good={stats.bestToPar !== null && stats.bestToPar < 0} />
            <Quick label="Birdies" value={`${Math.round(stats.birdieRate * 100)}%`} />
          </div>
        </div>
      )}

      <Section
        title={finished.length === 0 ? undefined : "Recent rounds"}
        className="mt-[44px]"
        action={
          finished.length > 0 && (
            <button className="label text-live" onClick={() => nav("/rounds")}>
              All rounds
            </button>
          )
        }
      >
        {finished.length === 0 ? (
          <EmptyState
            title="No rounds yet"
            body="Your first scorecard lands here. Find a course nearby and start a round."
            action={
              <Button variant="primary" onClick={() => nav("/courses")}>
                Find courses near me
              </Button>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-[14px] bg-surface">
            {finished.slice(0, 5).map((r) => (
              <RoundRow key={r.id} round={r} scores={scores} players={players} meId={me?.id} onClick={() => nav(`/rounds/${r.id}`)} subtitle={formatRoundDate(r.startedAt)} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Quick({ label, value, good }: { label: string; value: string | number; good?: boolean }) {
  return (
    <div className="px-[11px] text-center">
      <div className={cx("display numeric text-[26px]", good && "text-live")}>{value}</div>
      <div className="label mt-2 text-ink-3">{label}</div>
    </div>
  );
}
