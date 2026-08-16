export type ThemeMode = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "jingxing-theme";

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
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // The selected theme still applies for the current page session.
  }
}
