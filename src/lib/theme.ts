export type ThemePref = "system" | "light" | "dark";
const KEY = "medisc.theme";

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* private mode */
  }
  return "system";
}

export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0f1f18" : "#163a2c");
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* ignore */
  }
}

export function applyStoredTheme(): void {
  applyTheme(getThemePref());
}
