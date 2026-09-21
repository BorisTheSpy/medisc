import type { Course, Layout, Round } from "./types";

/** The default layout every course has. Holes without another layout belong here. */
export const MAIN_LAYOUT = "main";
export const LAYOUT_ID_RE = /^[a-zA-Z0-9_.-]{1,60}$/;

/** Main-layout holes keep their original ids so nothing stored before layouts existed has to move. */
export function holeId(courseId: string, layoutId: string, number: number): string {
  return layoutId === MAIN_LAYOUT ? `${courseId}-${number}` : `${courseId}-${layoutId}-${number}`;
}

export function layoutRowId(courseId: string, layoutId: string): string {
  return `${courseId}/${layoutId}`;
}

export function roundLayoutId(round: Pick<Round, "layoutId"> | null | undefined): string {
  return round?.layoutId || MAIN_LAYOUT;
}

const LENGTH_LABEL: Record<string, string> = { short: "Short", intermediate: "Medium length", long: "Long", "very-long": "Very long" };

export function formatLengthBin(bin: string | undefined | null): string | null {
  return bin ? (LENGTH_LABEL[bin] ?? null) : null;
}

/**
 * The layouts a course offers, main first, then by popularity. A course with no stored layouts still
 * has one implicit main layout so every screen can treat "which layout" as always answered.
 */
export function layoutsFor(course: Course, rows: Layout[]): Layout[] {
  const others = rows.filter((l) => l.layoutId !== MAIN_LAYOUT).sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0) || a.name.localeCompare(b.name));
  const main = rows.find((l) => l.layoutId === MAIN_LAYOUT) ?? {
    id: layoutRowId(course.id, MAIN_LAYOUT),
    courseId: course.id,
    layoutId: MAIN_LAYOUT,
    name: others.length ? "Main" : course.name,
    holeCount: course.holeCount,
    par: course.par,
    updatedAt: course.updatedAt,
  };
  return [main, ...others];
}

/** Which layout to open for a course: the requested one when it exists, otherwise main. */
export function pickLayout(layouts: Layout[], wanted: string | null | undefined): Layout {
  return layouts.find((l) => l.layoutId === wanted) ?? layouts.find((l) => l.layoutId === MAIN_LAYOUT) ?? layouts[0]!;
}
