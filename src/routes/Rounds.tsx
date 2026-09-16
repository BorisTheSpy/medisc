import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Play } from "lucide-react";
import { useAllScores, useMe, usePlayers, useRounds } from "@/db/hooks";
import { formatMonth, formatRoundDate } from "@/lib/format";
import { Button, Chip, EmptyState, PageHeader } from "@/components/ui";
import { RoundRow } from "@/components/RoundRow";

export function RoundsRoute() {
  const nav = useNavigate();
  const me = useMe();
  const rounds = useRounds();
  const scores = useAllScores();
  const players = usePlayers();
  const [courseId, setCourseId] = useState<string | null>(null);

  const courses = useMemo(() => {
    const m = new Map<string, { id: string; name: string; n: number }>();
    for (const r of rounds) {
      const c = m.get(r.courseId) ?? { id: r.courseId, name: r.courseName, n: 0 };
      c.n += 1;
      m.set(r.courseId, c);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [rounds]);

  const groups = useMemo(() => {
    const filtered = courseId ? rounds.filter((r) => r.courseId === courseId) : rounds;
    const m = new Map<string, typeof rounds>();
    for (const r of filtered) {
      const k = formatMonth(r.startedAt);
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()];
  }, [rounds, courseId]);

  return (
    <div>
      <PageHeader title="Rounds" sub={`${rounds.length} played`} />
      {courses.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
          <Chip active={courseId === null} onClick={() => setCourseId(null)}>
            All courses
          </Chip>
          {courses.map((c) => (
            <Chip key={c.id} active={courseId === c.id} onClick={() => setCourseId(c.id)}>
              {c.name} · {c.n}
            </Chip>
          ))}
        </div>
      )}
      {rounds.length === 0 ? (
        <EmptyState
          title="No rounds yet"
          body="Every scorecard you finish is kept here, grouped by month."
          action={
            <Button variant="primary" onClick={() => nav("/play")}>
              <Play size={18} fill="currentColor" /> Start a round
            </Button>
          }
        />
      ) : (
        <div className="space-y-6 px-4">
          {groups.map(([month, list]) => (
            <section key={month}>
              <h2 className="mb-2 text-sm font-bold text-ink-2">{month}</h2>
              <div className="overflow-hidden rounded-card bg-surface shadow-card">
                {list.map((r) => (
                  <RoundRow key={r.id} round={r} scores={scores} players={players} meId={me?.id} onClick={() => nav(r.finishedAt ? `/rounds/${r.id}` : `/rounds/${r.id}/play`)} subtitle={`${formatRoundDate(r.startedAt)}${r.finishedAt ? "" : " · in progress"}`} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
