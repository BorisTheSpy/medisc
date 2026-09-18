import { useMemo } from "react";
import { useNavigate } from "react-router";
import { Play, Settings, ChevronRight, Flame } from "lucide-react";
import { useAllScores, useLiveRound, useMe, usePlayers, useRounds } from "@/db/hooks";
import { overview, weeklyStreak } from "@/domain/stats";
import { roundTotals } from "@/domain/scoring";
import { formatToPar } from "@/domain/scoring";
import { formatRoundDate } from "@/lib/format";
import { Button, Card, IconButton, Section, EmptyState } from "@/components/ui";
import { mergePlayerInto } from "@/db/repo";
import { useState } from "react";
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
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Late night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div>
      <header className="safe-top px-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Logo size={30} />
            <span className="text-lg font-extrabold tracking-tight">Medisc</span>
          </div>
          <IconButton label="Settings" onClick={() => nav("/settings")}>
            <Settings size={22} />
          </IconButton>
        </div>
        <h1 className="display mt-6 text-[40px]">
          {greeting}, {me?.name.split(" ")[0]}.
        </h1>
        {streak > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-ink-2">
            <Flame size={16} className="text-accent" />
            {streak === 1 ? "1 week streak. Play this week to keep it." : `${streak} week streak. Keep it going.`}
          </p>
        )}
      </header>

      {orphan && (
        <div className="mt-6 px-4">
          <div className="rounded-card bg-surface p-4 shadow-card">
            <div className="font-semibold">
              {orphan.count} {orphan.count === 1 ? "round lists" : "rounds list"} “{orphan.player.name}” but not you
            </div>
            <p className="mt-1 text-sm text-ink-2">If that's you under another name, claim those rounds and they'll count toward your stats.</p>
            <div className="mt-3 flex gap-2">
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
                No, someone else
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 px-4">
        {live ? (
          <Card className="overflow-hidden bg-brand text-brand-ink" onClick={() => nav(`/rounds/${live.id}/play`)}>
            <div className="flex items-center justify-between p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-semibold text-accent">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" /> Round in progress
                </div>
                <div className="mt-1 truncate text-lg font-bold">{live.courseName}</div>
                <div className="mt-0.5 text-sm text-brand-ink/75">
                  {live.playerIds
                    .map((id) => {
                      const p = players.find((x) => x.id === id);
                      const t = liveTotals?.get(id);
                      return `${p?.name.split(" ")[0] ?? "?"} ${t && t.holesScored ? formatToPar(t.toPar) : "–"}`;
                    })
                    .join(" · ")}
                </div>
              </div>
              <ChevronRight className="shrink-0 text-accent" />
            </div>
          </Card>
        ) : (
          <Button variant="primary" size="lg" full onClick={() => nav("/play")}>
            <Play size={20} fill="currentColor" /> Start a round
          </Button>
        )}
      </div>

      {stats && stats.rounds > 0 && (
        <Section className="mt-6">
          <div className="grid grid-cols-4 gap-2 rounded-card bg-surface p-3 shadow-card">
            <Quick label="Rounds" value={stats.rounds} />
            <Quick label="Courses" value={stats.coursesPlayed} />
            <Quick label="Best" value={stats.bestToPar === null ? "–" : formatToPar(stats.bestToPar)} />
            <Quick label="Birdie rate" value={`${Math.round(stats.birdieRate * 100)}%`} />
          </div>
        </Section>
      )}

      <Section
        title="Recent rounds"
        className="mt-8"
        action={
          finished.length > 0 && (
            <button className="text-sm font-semibold text-birdie" onClick={() => nav("/rounds")}>
              See all
            </button>
          )
        }
      >
        {finished.length === 0 ? (
          <EmptyState
            title="No rounds yet"
            body="Your first scorecard lands here. Find a course nearby and tap Start a round."
            action={
              <Button variant="brand" onClick={() => nav("/courses")}>
                Find courses near me
              </Button>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-card bg-surface shadow-card">
            {finished.slice(0, 5).map((r) => (
              <RoundRow key={r.id} round={r} scores={scores} players={players} meId={me?.id} onClick={() => nav(`/rounds/${r.id}`)} subtitle={formatRoundDate(r.startedAt)} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Quick({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <div className="display numeric text-[24px]">{value}</div>
      <div className="mt-0.5 text-[11px] font-medium text-ink-3">{label}</div>
    </div>
  );
}
