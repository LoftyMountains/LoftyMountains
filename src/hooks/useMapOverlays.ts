import { useCallback, useEffect, useState } from "react";
import type { MapOverlaysSnapshot } from "../../shared/types";
import { apiUrl } from "../lib/api";

export function useMapOverlays() {
  const [snapshot, setSnapshot] = useState<MapOverlaysSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let disposed = false;
    let controller: AbortController | null = null;
    async function load() {
      if (controller || disposed) return;
      controller = new AbortController();
      const timer = window.setTimeout(() => controller?.abort(), 25_000);
      setRefreshing(true);
      try {
        const response = await fetch(apiUrl("/api/map-overlays"), { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(`Map layer update failed (${response.status})`);
        const data = await response.json() as MapOverlaysSnapshot;
        if (!Array.isArray(data.features) || !Array.isArray(data.layers) || data.persisted !== false) throw new Error("Invalid map layer format");
        if (!disposed) { setSnapshot(data); setError(null); }
      } catch (failure) {
        if (!disposed) setError(failure instanceof Error && failure.name !== "AbortError" ? failure.message : "Map layer update timed out");
      } finally {
        window.clearTimeout(timer); controller = null;
        if (!disposed) setRefreshing(false);
      }
    }
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30_000);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { disposed = true; controller?.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [revision]);
  return { snapshot, error, refreshing, refresh };
}
