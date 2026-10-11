import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveAviationSnapshot } from "../../shared/types";
import { apiUrl } from "../lib/api";
import { aviationRefreshDelay, aviationScopeKey, normalizeAviationCenter, validateLiveAviation, type AviationCenter } from "../lib/live-aviation";

export function useLiveAviation(center: AviationCenter, enabled: boolean) {
  const normalized = normalizeAviationCenter(center);
  const key = aviationScopeKey(normalized);
  const [settled, setSettled] = useState(normalized);
  const settledKey = aviationScopeKey(settled);
  const [result, setResult] = useState<{ key: string; snapshot: LiveAviationSnapshot } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(normalized), 600);
    return () => window.clearTimeout(timer);
  }, [key]);

  useEffect(() => {
    if (!enabled || key !== settledKey) { setResult(null); setFailure(null); setRefreshing(false); return; }
    let disposed = false;
    let controller: AbortController | null = null;
    let timer: number | undefined;
    let nextAllowedAt = 0;
    let failureDelay = 30_000;
    function schedule(delay: number) {
      window.clearTimeout(timer);
      if (!disposed && document.visibilityState === "visible") timer = window.setTimeout(() => { void load(); }, delay);
    }
    async function load() {
      if (disposed || controller || document.visibilityState !== "visible") return;
      if (Date.now() < nextAllowedAt) { schedule(nextAllowedAt - Date.now()); return; }
      controller = new AbortController();
      const request = controller;
      const timeout = window.setTimeout(() => request.abort(), 20_000);
      nextAllowedAt = Date.now() + 30_000;
      setRefreshing(true);
      let delay = 30_000;
      try {
        const response = await fetch(apiUrl(`/api/aviation?lat=${settled.latitude}&lon=${settled.longitude}`), { signal: request.signal, cache: "no-store" });
        if (!response.ok) {
          const retry = response.headers.get("retry-after");
          const retryMs = retry && /^\d+(?:\.\d+)?$/.test(retry) ? Number(retry) * 1000 : retry ? Date.parse(retry) - Date.now() : 0;
          delay = aviationRefreshDelay(Math.max(failureDelay, retryMs || 0));
          throw new Error(`Aviation update failed (${response.status})`);
        }
        const snapshot = validateLiveAviation(await response.json(), settled);
        delay = aviationRefreshDelay(snapshot.refreshAfterMs);
        if (!disposed && document.visibilityState === "visible") { setResult({ key, snapshot }); setFailure(null); }
        failureDelay = 30_000;
      } catch (error) {
        if (!disposed && document.visibilityState === "visible") {
          delay = Math.max(delay, failureDelay);
          failureDelay = Math.min(3_600_000, failureDelay * 2);
          setFailure({ key, message: error instanceof Error && error.name !== "AbortError" ? error.message : "Aviation update timed out" });
        }
      } finally {
        window.clearTimeout(timeout);
        controller = null;
        nextAllowedAt = Date.now() + delay;
        if (!disposed) { setRefreshing(false); schedule(delay); }
      }
    }
    refreshRef.current = () => { void load(); };
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
      else { window.clearTimeout(timer); controller?.abort(); }
    };
    document.addEventListener("visibilitychange", onVisible);
    void load();
    return () => { disposed = true; window.clearTimeout(timer); controller?.abort(); refreshRef.current = () => {}; document.removeEventListener("visibilitychange", onVisible); };
  }, [key, settledKey, enabled]);

  return {
    scope: { ...normalized, radiusNm: 250 },
    snapshot: enabled && key === settledKey && result?.key === key ? result.snapshot : null,
    error: enabled && failure?.key === key ? failure.message : null,
    refreshing: enabled && (key !== settledKey || refreshing),
    refresh,
  };
}
