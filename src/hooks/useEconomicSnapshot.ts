import { useCallback, useEffect, useState } from "react";
import type { EconomicSnapshot } from "../../shared/types";
import { apiUrl } from "../lib/api";

export function useEconomicSnapshot(hours: number) {
  const [snapshot, setSnapshot] = useState<EconomicSnapshot | null>(null);
  const [snapshotHours, setSnapshotHours] = useState(hours);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;
    async function load() {
      if (controller || cancelled) return;
      controller = new AbortController();
      const signal = controller.signal;
      const timeout = window.setTimeout(() => controller?.abort(), 15_000);
      setRefreshing(true);
      try {
        const response = await fetch(apiUrl(`/api/economy?hours=${hours}`), { signal, cache: "no-store" });
        if (!response.ok) throw new Error(`News update failed (${response.status})`);
        const payload = await response.json() as EconomicSnapshot;
        if (!Array.isArray(payload.items) || !Array.isArray(payload.sources) || !payload.coverage) throw new Error("Invalid news response format");
        if (!cancelled) {
          setSnapshot(payload);
          setSnapshotHours(hours);
          setError(null);
        }
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error && failure.name !== "AbortError" ? failure.message : "Request timed out. Please try again.");
      } finally {
        window.clearTimeout(timeout);
        controller = null;
        if (!cancelled) setRefreshing(false);
      }
    }
    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30_000);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hours, revision]);

  return { snapshot, snapshotHours, error, refreshing, refresh, revision };
}
