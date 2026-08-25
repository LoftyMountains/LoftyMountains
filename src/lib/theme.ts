export type ThemeMode = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "jingxing-theme";

const LIGHT_THEME_COLOR = "#f4f5f7";
const DARK_THEME_COLOR = "#0b0d10";

export function readThemeMode(): ThemeMode {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  return "system";
}

export function applyThemeMode(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = mode === "dark" || (mode === "system" && prefersDark) ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // The selected theme still applies for the current page session.
  }
}
