import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import type { HoleScore, Player, Round } from "@/domain/types";
import { formatToPar, roundTotals } from "@/domain/scoring";
import { cx } from "./ui";

export function RoundRow({ round, scores, players, meId, onClick, subtitle }: { round: Round; scores: HoleScore[]; players: Player[]; meId?: string; onClick: () => void; subtitle: string }) {
  const totals = useMemo(() => roundTotals(scores.filter((s) => s.roundId === round.id)), [scores, round.id]);
  const mine = meId ? totals.get(meId) : undefined;
  const others = round.playerIds.filter((id) => id !== meId);
  const rank = useMemo(() => {
    if (!mine) return null;
    const all = round.playerIds.map((id) => totals.get(id)?.toPar ?? Infinity);
    return all.filter((t) => t < mine.toPar).length + 1;
  }, [mine, round.playerIds, totals]);
  const under = mine && mine.toPar < 0;
  const leader = useMemo(() => {
    if (mine) return null;
    let best: { id: string; toPar: number; strokes: number; holes: number } | null = null;
    for (const id of round.playerIds) {
      const t = totals.get(id);
      if (t && t.holesScored > 0 && (!best || t.toPar < best.toPar)) best = { id, toPar: t.toPar, strokes: t.strokes, holes: t.holesScored };
    }
    return best;
  }, [mine, round.playerIds, totals]);
  const leaderName = leader ? (players.find((p) => p.id === leader.id)?.name.split(" ")[0] ?? "?") : null;
  return (
    <button onClick={onClick} className="flex w-full items-center gap-[11px] border-b hairline px-[22px] py-[15px] text-left last:border-b-0 active:bg-surface-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-extrabold text-ink">
          {round.courseName}
          {round.layoutName && <span className="font-semibold text-ink-3"> · {round.layoutName}</span>}
        </div>
        <div className="label mt-2 truncate text-ink-3">
          {subtitle}
          {others.length > 0 && ` · with ${others.map((id) => players.find((p) => p.id === id)?.name.split(" ")[0] ?? "?").join(", ")}`}
          {round.playerIds.length > 1 && rank === 1 && <span className="text-lime"> · Won</span>}
        </div>
      </div>
      <div className="text-right">
        <div className={cx("display numeric text-[30px]", under ? "text-lime" : mine && mine.toPar > 0 ? "text-ink" : "text-ink-2")}>{mine && mine.holesScored ? formatToPar(mine.toPar) : leader ? formatToPar(leader.toPar) : "–"}</div>
        <div className="label mt-1.5 text-ink-3">{mine ? `${mine.strokes} · ${mine.holesScored} holes` : leader ? `${leaderName} · not on card` : "no scores"}</div>
      </div>
      <ChevronRight size={18} className="shrink-0 text-ink-3" />
    </button>
  );
}
