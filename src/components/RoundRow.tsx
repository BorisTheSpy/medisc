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
    const better = all.filter((t) => t < mine.toPar).length;
    return better + 1;
  }, [mine, round.playerIds, totals]);
  const under = mine && mine.toPar < 0;
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 border-b hairline px-4 py-3 text-left last:border-b-0 active:bg-surface-2">
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{round.courseName}</div>
        <div className="mt-0.5 truncate text-xs text-ink-3">
          {subtitle}
          {others.length > 0 && ` · with ${others.map((id) => players.find((p) => p.id === id)?.name.split(" ")[0] ?? "?").join(", ")}`}
          {round.playerIds.length > 1 && rank === 1 && " · You won"}
        </div>
      </div>
      <div className="text-right">
        <div className={cx("display numeric text-[26px]", under ? "text-birdie" : mine && mine.toPar > 0 ? "text-triple" : "")}>{mine && mine.holesScored ? formatToPar(mine.toPar) : "–"}</div>
        <div className="numeric text-xs text-ink-3">{mine ? `${mine.strokes} · ${mine.holesScored} holes` : "not on card"}</div>
      </div>
      <ChevronRight size={18} className="shrink-0 text-ink-3" />
    </button>
  );
}
