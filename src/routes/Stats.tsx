import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Play, Sparkles } from "lucide-react";
import { useAllScores, useMe, usePlayers, useRounds } from "@/db/hooks";
import { bestRounds, bestShots, completedRounds, distribution, filterRange, formSeries, headToHead, overview, perCourse, throwStats, weeklyStreak, type RangeKey } from "@/domain/stats";
import { formatToPar } from "@/domain/scoring";
import { avg, pct } from "@/lib/format";
import { Button, EmptyState, PageHeader, Section, Segmented, StatTile, cx } from "@/components/ui";
import { format } from "date-fns";

const RANGES: { value: RangeKey; label: string }[] = [
  { value: "last5", label: "Last 5" },
  { value: "last20", label: "Last 20" },
  { value: "year", label: "This year" },
  { value: "all", label: "All" },
];

const DIST_ORDER = [
  { key: "ace", label: "Ace", color: "#d2ff00" },
  { key: "eagle", label: "Eagle", color: "#c2ea1a" },
  { key: "birdie", label: "Birdie", color: "#a7cc2a" },
  { key: "par", label: "Par", color: "#9a9c8e" },
  { key: "bogey", label: "Bogey", color: "#e0dfd4" },
  { key: "double", label: "Double", color: "#f4f4ed" },
  { key: "triple", label: "Triple+", color: "#ff5b3a" },
] as const;

export function StatsRoute() {
  const nav = useNavigate();
  const me = useMe();
  const allRounds = useRounds();
  const scores = useAllScores();
  const players = usePlayers();
  const [range, setRange] = useState<RangeKey>("last20");
  const [scope, setScope] = useState<"completed" | "all">("all");
  const meId = me?.id ?? "";

  const finishedAll = useMemo(() => allRounds.filter((r) => r.finishedAt), [allRounds]);
  const finished = useMemo(() => (scope === "completed" ? completedRounds(finishedAll, scores, meId) : finishedAll), [finishedAll, scores, meId, scope]);
  const rounds = useMemo(() => filterRange(finished, range), [finished, range]);
  const o = useMemo(() => overview(rounds, scores, meId), [rounds, scores, meId]);
  const dist = useMemo(() => distribution(rounds, scores, meId), [rounds, scores, meId]);
  const form = useMemo(() => formSeries(rounds, scores, meId), [rounds, scores, meId]);
  const best = useMemo(() => bestRounds(rounds, scores, meId, 5), [rounds, scores, meId]);
  const shots = useMemo(() => bestShots(rounds, scores, meId), [rounds, scores, meId]);
  const ts = useMemo(() => throwStats(rounds, scores, meId), [rounds, scores, meId]);
  const courses = useMemo(() => perCourse(rounds, scores, meId), [rounds, scores, meId]);
  const h2h = useMemo(() => headToHead(rounds, scores, meId, players), [rounds, scores, meId, players]);
  const streak = useMemo(() => weeklyStreak(finished), [finished]);
  const recentForm = useMemo(() => {
    const last = form.slice(-5);
    return last.length ? last.reduce((a, p) => a + p.toPar, 0) / last.length : null;
  }, [form]);

  if (finishedAll.length === 0) {
    return (
      <div>
        <PageHeader title="Stats" />
        <EmptyState
          icon={<Sparkles size={36} />}
          title="Stats start with one round"
          body="Finish a scorecard and this page fills in with your form, bests, score mix and course records."
          action={
            <Button variant="primary" onClick={() => nav("/play")}>
              <Play size={18} fill="currentColor" /> Start a round
            </Button>
          }
        />
      </div>
    );
  }

  const distData = DIST_ORDER.map((d) => ({ ...d, value: dist[d.key] }));
  const totalHoles = distData.reduce((a, d) => a + d.value, 0);
  const formData = form.map((p, i) => ({ i, toPar: p.toPar, label: format(new Date(p.date), "d MMM"), course: p.courseName, holes: p.holes }));

  return (
    <div>
      <PageHeader title="Stats" sub={`${rounds.length} ${rounds.length === 1 ? "round" : "rounds"} in range`} />
      <div className="space-y-2 px-4">
        <Segmented value={range} onChange={setRange} options={RANGES} className="w-full justify-between" />
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-3">{scope === "completed" ? "Only rounds where you scored every hole" : "Every finished round, even partial ones"}</span>
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: "all", label: "All" },
              { value: "completed", label: "Completed" },
            ]}
          />
        </div>
      </div>

      <Section className="mt-4">
        <div className="rounded-[39px] bg-lime px-[22px] py-[22px] text-on-lime">
          <div className="flex items-end justify-between">
            <div>
              <div className="label">Form, last 5 rounds</div>
              <div className="display numeric mt-2 text-[72px] leading-[0.8]">{avg(recentForm)}</div>
              <div className="label mt-3 opacity-70">to par per round</div>
            </div>
            <div className="text-right">
              <div className="label">Best round</div>
              <div className="display numeric mt-2 text-[40px]">{o.bestToPar === null ? "–" : formatToPar(o.bestToPar)}</div>
              {streak > 0 && <div className="label mt-3 opacity-70">{streak} week streak</div>}
            </div>
          </div>
        </div>
      </Section>

      <Section className="mt-3">
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Rounds" value={o.rounds} sub={`${o.holes} holes`} />
          <StatTile label="Average" value={avg(o.avgToPar)} sub="to par per round" />
          <StatTile label="Per hole" value={o.avgStrokesPerHole?.toFixed(2) ?? "–"} sub="strokes" />
          <StatTile label="Birdie or better" value={pct(o.birdieRate)} tone={o.birdieRate >= 0.25 ? "good" : undefined} />
          <StatTile label="Par or better" value={pct(o.parOrBetterRate)} />
          <StatTile label="Bogey or worse" value={pct(o.bogeyOrWorseRate)} tone={o.bogeyOrWorseRate > 0.5 ? "bad" : undefined} />
        </div>
      </Section>

      {formData.length >= 2 && (
        <Section title="Round by round" className="mt-6">
          <div className="rounded-card bg-surface p-3 pt-4 shadow-card">
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={formData} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid vertical={false} stroke="var(--line)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatToPar(v)} width={44} />
                  <ReferenceLine y={0} stroke="var(--line-strong)" strokeDasharray="3 3" />
                  <Tooltip
                    cursor={{ stroke: "var(--line-strong)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as (typeof formData)[number];
                      return (
                        <div className="rounded-[6px] bg-lime px-3 py-2 text-xs font-bold text-on-lime">
                          <div className="font-bold">{formatToPar(p.toPar)}</div>
                          <div>
                            {p.course} · {p.holes} holes · {p.label}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Line type="monotone" dataKey="toPar" stroke="#d2ff00" strokeWidth={2.5} dot={{ r: 3, fill: "#d2ff00", strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-1 text-center text-[11px] text-ink-3">Score to par per round. Lower is better.</div>
          </div>
        </Section>
      )}

      <Section title="Score mix" className="mt-6">
        <div className="rounded-card bg-surface p-3 shadow-card">
          <div className="flex h-3 w-full overflow-hidden rounded-[2px] bg-surface-2">
            {distData.map((d) => d.value > 0 && <div key={d.key} style={{ width: `${(d.value / totalHoles) * 100}%`, background: d.color }} title={`${d.label}: ${d.value}`} />)}
          </div>
          <div className="mt-3 h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distData} margin={{ top: 4, right: 0, bottom: 0, left: -24 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} interval={0} />
                <YAxis tick={{ fontSize: 10, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: "var(--surface-2)" }} formatter={(v) => [`${v} holes`, ""]} contentStyle={{ background: "#d2ff00", color: "#282c20", border: 0, borderRadius: 6, fontSize: 12, fontWeight: 700 }} itemStyle={{ color: "#282c20" }} labelStyle={{ color: "#282c20" }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                  {distData.map((d) => (
                    <Cell key={d.key} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Section>

      <Section title="Best shots" className="mt-6">
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="Aces" value={shots.aces.length} sub={shots.aces[0] ? `${shots.aces[0].courseName}, hole ${shots.aces[0].holeNumber}` : "Still waiting"} tone={shots.aces.length ? "good" : undefined} />
          <StatTile label="Eagles" value={shots.eagles} />
          <StatTile label="Birdie streak" value={shots.longestBirdieStreak} sub="in a row, best ever" />
          <StatTile label="Most birdies" value={shots.mostBirdiesInRound?.count ?? 0} sub={shots.mostBirdiesInRound ? `${shots.mostBirdiesInRound.courseName}, ${format(new Date(shots.mostBirdiesInRound.date), "d MMM")}` : "in one round"} />
        </div>
      </Section>

      {best.length > 0 && (
        <Section title="Best rounds" className="mt-6">
          <div className="overflow-hidden rounded-card bg-surface shadow-card">
            {best.map((r, i) => (
              <button key={r.roundId} onClick={() => nav(`/rounds/${r.roundId}`)} className="flex w-full items-center gap-3 border-b hairline px-4 py-3 text-left last:border-b-0 active:bg-surface-2">
                <span className="display numeric w-6 text-lime">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{r.courseName}</div>
                  <div className="text-xs text-ink-3">
                    {format(new Date(r.startedAt), "d MMM yyyy")} · {r.holes} holes
                  </div>
                </div>
                <span className={cx("display numeric text-[28px]", r.toPar < 0 ? "text-lime" : "text-ink")}>{formatToPar(r.toPar)}</span>
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="Throwing" className="mt-6">
        {ts.holesTracked === 0 ? (
          <div className="rounded-card bg-surface p-4 text-sm text-ink-2 shadow-card">Turn on Track throws when you start a round to see fairway hits, circle-in-regulation, putting and scramble rates here.</div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <StatTile label="Fairway hit" value={pct(ts.fairwayHit)} />
              <StatTile label="C1 in reg" value={pct(ts.c1InReg)} />
              <StatTile label="C2 in reg" value={pct(ts.c2InReg)} />
              <StatTile label="Parked" value={pct(ts.parked)} />
              <StatTile label="Scramble" value={pct(ts.scramble)} />
              <StatTile label="OB rate" value={pct(ts.obRate)} tone={ts.obRate > 0.2 ? "bad" : undefined} />
              <StatTile label="C1 putting" value={ts.c1Putting.attempts ? pct(ts.c1Putting.made / ts.c1Putting.attempts) : "–"} sub={`${ts.c1Putting.made} of ${ts.c1Putting.attempts}`} />
              <StatTile label="C1X putting" value={ts.c1xPutting.attempts ? pct(ts.c1xPutting.made / ts.c1xPutting.attempts) : "–"} sub="excludes tap-ins" />
              <StatTile label="C2 putting" value={ts.c2Putting.attempts ? pct(ts.c2Putting.made / ts.c2Putting.attempts) : "–"} sub={`${ts.c2Putting.made} of ${ts.c2Putting.attempts}`} />
            </div>
            <p className="mt-2 text-[11px] text-ink-3">
              From {ts.holesTracked} tracked holes. Throw-ins: {ts.throwIns}.
            </p>
          </>
        )}
      </Section>

      {courses.length > 0 && (
        <Section title="By course" className="mt-6">
          <div className="overflow-hidden rounded-card bg-surface shadow-card">
            <div className="grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem] items-center border-b hairline px-4 py-2 text-[11px] font-semibold text-ink-3">
              <span>Course</span>
              <span className="text-right">Rounds</span>
              <span className="text-right">Best</span>
              <span className="text-right">Avg</span>
            </div>
            {courses.map((c) => (
              <button key={c.courseId} onClick={() => nav(`/courses/${c.courseId}`)} className="grid w-full grid-cols-[1fr_3.5rem_3.5rem_3.5rem] items-center border-b hairline px-4 py-3 text-left text-sm last:border-b-0 active:bg-surface-2">
                <span className="truncate font-semibold">{c.courseName}</span>
                <span className="numeric text-right text-ink-2">{c.rounds}</span>
                <span className={cx("numeric text-right font-bold", c.bestToPar < 0 ? "text-birdie" : "")}>{formatToPar(c.bestToPar)}</span>
                <span className="numeric text-right text-ink-2">{avg(c.avgToPar)}</span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {h2h.length > 0 && (
        <Section title="Head to head" className="mt-6 mb-4">
          <div className="overflow-hidden rounded-card bg-surface shadow-card">
            {h2h.map((h) => {
              const p = players.find((x) => x.id === h.playerId);
              return (
                <div key={h.playerId} className="flex items-center gap-3 border-b hairline px-4 py-3 last:border-b-0">
                  <span className="inline-grid h-8 w-8 place-items-center rounded-full text-xs font-bold text-white" style={{ background: p?.color ?? "#888" }}>
                    {h.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{h.name}</div>
                    <div className="text-xs text-ink-3">
                      {h.wins > h.losses ? `You lead ${h.wins}–${h.losses}` : h.losses > h.wins ? `${h.name.split(" ")[0]} leads ${h.losses}–${h.wins}` : `Level at ${h.wins}–${h.losses}`}
                      {h.ties > 0 ? `, ${h.ties} ${h.ties === 1 ? "tie" : "ties"}` : ""} · {h.rounds === 1 ? "1 round together" : `${h.rounds} rounds together`}
                    </div>
                  </div>
                  <div className="numeric text-right text-sm">
                    <div className="text-[10px] font-medium text-ink-3">you · them</div>
                    <div>
                      <span className={cx("font-bold", h.wins >= h.losses ? "text-birdie" : "text-ink-2")}>{h.wins}</span>
                      <span className="text-ink-3"> – </span>
                      <span className={cx("font-bold", h.losses > h.wins ? "text-triple" : "text-ink-2")}>{h.losses}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}
