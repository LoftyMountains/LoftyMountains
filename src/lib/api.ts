const defaultProductionBase = "https://api.loftymountains.com";
const localPreview = typeof window !== "undefined"
  && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname === "::1");
const configuredBase = (import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV || localPreview ? "" : defaultProductionBase))
  .trim()
  .replace(/\/+$/, "");

/** Keeps local development same-origin while allowing Pages to call a public API hostname. */
export function apiUrl(path: string) {
  return `${configuredBase}${path.startsWith("/") ? path : `/${path}`}`;
}
