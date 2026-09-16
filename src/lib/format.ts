import { format, formatDistanceToNowStrict, isThisYear, isToday, isYesterday } from "date-fns";

export function formatRoundDate(t: number): string {
  const d = new Date(t);
  if (isToday(d)) return `Today, ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `Yesterday, ${format(d, "HH:mm")}`;
  if (isThisYear(d)) return format(d, "EEE d MMM");
  return format(d, "d MMM yyyy");
}

export function formatMonth(t: number): string {
  return format(new Date(t), "MMMM yyyy");
}

export function timeAgo(t: number): string {
  return formatDistanceToNowStrict(new Date(t), { addSuffix: true });
}

export function pct(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export function avg(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "–";
  const sign = x > 0 ? "+" : "";
  return `${sign}${x.toFixed(digits)}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
