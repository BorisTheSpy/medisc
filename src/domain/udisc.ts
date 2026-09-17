/**
 * Parser for the CSV that UDisc exports from You > Rounds > Export.
 * Columns: PlayerName,CourseName,LayoutName,StartDate,EndDate,Total,+/-,RoundRating,Hole1..HoleN
 * Each round is a block of rows sharing course, layout and start date. The row whose PlayerName is "Par"
 * carries the layout's pars; the other rows are players' hole scores.
 */

export interface UdiscPlayerRow {
  name: string;
  scores: number[];
  total?: number;
  toPar?: number;
  rating?: number;
}

export interface UdiscRound {
  courseName: string;
  layoutName: string;
  startedAt: number;
  endedAt?: number;
  pars: number[];
  players: UdiscPlayerRow[];
}

export interface UdiscLayout {
  courseName: string;
  layoutName: string;
  pars: number[];
}

export interface UdiscExport {
  rounds: UdiscRound[];
  playerNames: string[];
  layouts: UdiscLayout[];
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** UDisc dates look like "2026-08-30 1402" (local time). Also accepts ISO-ish strings. */
export function parseUdiscDate(raw: string): number {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):?(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])).getTime();
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : Date.now();
}

export function parseUdiscCsv(text: string): UdiscExport {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("This file is empty.");
  const header = parseCsvLine(lines[0]);
  const col = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const iPlayer = col("PlayerName");
  const iCourse = col("CourseName");
  const iLayout = col("LayoutName");
  const iStart = col("StartDate");
  const iEnd = col("EndDate");
  const iTotal = col("Total");
  const iToPar = col("+/-");
  const iRating = col("RoundRating");
  const holeCols = header.map((h, i) => ({ h, i })).filter(({ h }) => /^Hole\s*\d+$/i.test(h)).map(({ i }) => i);
  if (iPlayer < 0 || iCourse < 0 || iStart < 0 || holeCols.length === 0) {
    throw new Error("This does not look like a UDisc export. Use You > Rounds > menu > Export CSV in UDisc.");
  }

  const rounds = new Map<string, UdiscRound>();
  const order: string[] = [];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const name = cells[iPlayer] ?? "";
    const courseName = cells[iCourse] ?? "";
    if (!name || !courseName) continue;
    const layoutName = (iLayout >= 0 ? cells[iLayout] : "") || "Main";
    const startRaw = cells[iStart] ?? "";
    const key = `${courseName}|${layoutName}|${startRaw}`;
    let round = rounds.get(key);
    if (!round) {
      round = { courseName, layoutName, startedAt: parseUdiscDate(startRaw), endedAt: iEnd >= 0 && cells[iEnd] ? parseUdiscDate(cells[iEnd]) : undefined, pars: [], players: [] };
      rounds.set(key, round);
      order.push(key);
    }
    const values = holeCols.map((i) => {
      const v = (cells[i] ?? "").trim();
      return v === "" ? NaN : Number(v);
    });
    if (name.toLowerCase() === "par") {
      round.pars = values;
    } else {
      const num = (i: number) => (i >= 0 && cells[i] !== undefined && cells[i] !== "" ? Number(cells[i]) : undefined);
      round.players.push({ name, scores: values, total: num(iTotal), toPar: num(iToPar), rating: num(iRating) });
    }
  }

  const result: UdiscRound[] = [];
  for (const key of order) {
    const r = rounds.get(key)!;
    // Hole count is the number of holes with a par; fall back to the longest score row.
    let n = r.pars.findIndex((p) => !Number.isFinite(p));
    if (n < 0) n = r.pars.length;
    if (r.pars.length === 0) {
      n = Math.max(0, ...r.players.map((p) => p.scores.findIndex((s) => !Number.isFinite(s))).map((i, idx) => (i < 0 ? r.players[idx].scores.length : i)));
      r.pars = Array.from({ length: n }, () => 3);
    }
    r.pars = r.pars.slice(0, n).map((p) => (Number.isFinite(p) ? p : 3));
    r.players = r.players.map((p) => ({ ...p, scores: p.scores.slice(0, n).map((s) => (Number.isFinite(s) ? s : 0)) }));
    if (n > 0 && r.players.length > 0) result.push(r);
  }

  const playerNames: string[] = [];
  for (const r of result) for (const p of r.players) if (!playerNames.includes(p.name)) playerNames.push(p.name);
  const layoutMap = new Map<string, UdiscLayout>();
  for (const r of result) {
    const k = `${r.courseName}|${r.layoutName}`;
    if (!layoutMap.has(k)) layoutMap.set(k, { courseName: r.courseName, layoutName: r.layoutName, pars: r.pars });
  }
  return { rounds: result, playerNames, layouts: [...layoutMap.values()] };
}
