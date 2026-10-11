import { useCallback, useEffect, useState } from "react";
import type { IntelligenceSourcesSnapshot } from "../../shared/types";
import { apiUrl } from "../lib/api";

/** This endpoint reads the current catalog; it never requests upstream collection. */
export function useSourceCatalog() {
  const [snapshot, setSnapshot] = useState<IntelligenceSourcesSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let disposed = false;
    let controller: AbortController | null = null;
    async function load() {
      if (disposed || controller) return;
      const request = new AbortController(); controller = request;
      const timeout = window.setTimeout(() => request.abort(), 20_000);
      setRefreshing(true);
      try {
        const response = await fetch(apiUrl("/api/sources"), { signal: request.signal, cache: "no-store" });
        if (!response.ok) throw new Error(`来源目录暂时无法更新（${response.status}）`);
        const data = await response.json() as IntelligenceSourcesSnapshot;
        if (!Array.isArray(data.sources) || data.persisted !== false || !Number.isFinite(Date.parse(data.generatedAt))) throw new Error("来源目录格式异常");
        if (!disposed) { setSnapshot(data); setError(null); }
      } catch (failure) {
        if (!disposed) setError(failure instanceof Error && failure.name !== "AbortError" ? failure.message : "来源目录更新超时");
      } finally {
        window.clearTimeout(timeout); controller = null;
        if (!disposed) setRefreshing(false);
      }
    }
    void load();
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30_000);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { disposed = true; controller?.abort(); window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [revision]);
  return { snapshot, error, refreshing, refresh };
}
