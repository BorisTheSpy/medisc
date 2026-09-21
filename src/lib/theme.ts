/** The visual system is dark only; theme preference is kept for compatibility but always resolves to dark. */
export type ThemePref = "dark";

export function getThemePref(): ThemePref {
  return "dark";
}

export function applyTheme(_pref?: ThemePref): void {
  document.documentElement.setAttribute("data-theme", "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#0c1a2c");
}

export function applyStoredTheme(): void {
  applyTheme();
}
