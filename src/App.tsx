import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BootstrapPayload, MarketSnapshot, NewsItem, ReplayPayload, SourceId, SourceStatus } from "../shared/types";
import { Header } from "./components/Header";
import { MarketChart } from "./components/MarketChart";
import { NewsFeed, type ViewMode } from "./components/NewsFeed";
import { QueryPanel } from "./components/QueryPanel";
import { ReplayBar } from "./components/ReplayBar";
import { apiUrl } from "./lib/api";
import { applyThemeMode, readThemeMode, type ThemeMode } from "./lib/theme";
import { fromBeijingInput, toBeijingInput } from "./lib/time";

function uniqueNews(items: NewsItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id)));
}

const liveNewsSyncIntervalMs = 4_000;
const liveNewsOverlapMs = 3 * 60_000;
const streamStaleMs = 35_000;
const streamClientStorageKey = "jingxing-stream-client";

function liveRecoveryFrom(latestPublishedAt: string | null) {
  if (!latestPublishedAt) return null;
  const latestTime = new Date(latestPublishedAt).getTime();
  const cursorTime = Number.isFinite(latestTime) ? Math.min(latestTime, Date.now()) : Date.now();
  return new Date(cursorTime - liveNewsOverlapMs).toISOString();
}

function createStreamClientId() {
  try {
    const existing = window.sessionStorage.getItem(streamClientStorageKey);
    if (existing) return existing;
    const generated = window.crypto.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(streamClientStorageKey, generated);
    return generated;
  } catch {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  }
}

const InsightsDashboard = lazy(() => import("./components/InsightsDashboard").then((module) => ({ default: module.InsightsDashboard })));

function InsightsFallback() {
  return (
    <section id="market-insights" className="insights-dashboard" aria-busy="true">
      <header className="insights-heading">
        <div><span className="eyebrow">MARKET INTELLIGENCE</span><h1>热点与股票关联</h1></div>
      </header>
      <div className="analysis-windows">
        {Array.from({ length: 4 }, (_, index) => <div className="window-skeleton" key={index} />)}
      </div>
    </section>
  );
}

export function App() {
  const [liveNews, setLiveNews] = useState<NewsItem[]>([]);
  const [historyNews, setHistoryNews] = useState<NewsItem[]>([]);
  const [market, setMarket] = useState<MarketSnapshot | null>(null);
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ViewMode>("live");
  const [selectedSources, setSelectedSources] = useState<Set<SourceId>>(new Set());
  const [queryOpen, setQueryOpen] = useState(false);
  const [queryBusy, setQueryBusy] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [from, setFrom] = useState(() => toBeijingInput(new Date(Date.now() - 4 * 60 * 60 * 1000)));
  const [to, setTo] = useState(() => toBeijingInput(new Date()));
  const [query, setQuery] = useState("");
  const [replay, setReplay] = useState<ReplayPayload | null>(null);
  const [replayIndex, setReplayIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [now, setNow] = useState(Date.now());
  const [theme, setTheme] = useState<ThemeMode>(readThemeMode);
  const [analysisRevision, setAnalysisRevision] = useState<string | null>(null);
  const latestLiveNewsAt = useRef<string | null>(null);
  const liveNewsSyncController = useRef<AbortController | null>(null);
  const lastLiveNewsSyncAt = useRef(0);
  const streamClientId = useRef(createStreamClientId());

  const mergeLiveNews = useCallback((incoming: NewsItem[]) => {
    setLiveNews((current) => {
      const merged = uniqueNews([...incoming, ...current])
        .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
        .slice(0, 500);
      latestLiveNewsAt.current = merged[0]?.publishedAt || null;
      return merged;
    });
  }, []);

  const syncLiveNews = useCallback(async (force = false) => {
    if (force && liveNewsSyncController.current) {
      const staleController = liveNewsSyncController.current;
      liveNewsSyncController.current = null;
      staleController.abort();
    }
    if (liveNewsSyncController.current) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    liveNewsSyncController.current = controller;
    lastLiveNewsSyncAt.current = Date.now();
    try {
      const params = new URLSearchParams({ limit: "120" });
      const recoveryFrom = liveRecoveryFrom(latestLiveNewsAt.current);
      if (recoveryFrom) params.set("from", recoveryFrom);
      const response = await fetch(`${apiUrl("/api/news")}?${params}`, {
        // A stable URL lets the browser validate the API ETag and receive a
        // small 304 response when no new item arrived.
        cache: "no-cache",
        signal: controller.signal,
      });
      if (!response.ok) return;
      const payload = await response.json() as { items: NewsItem[] };
      mergeLiveNews(payload.items);
    } catch {
      // The stream watchdog or next foreground recovery retries missed items.
    } finally {
      window.clearTimeout(timeout);
      if (liveNewsSyncController.current === controller) liveNewsSyncController.current = null;
    }
  }, [mergeLiveNews]);

  useEffect(() => {
    applyThemeMode(theme);
  }, [theme]);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let events: EventSource | null = null;
    let lastStreamActivityAt = Date.now();
    let lastRecoveryAt = 0;
    let reconnectAttempt = 0;
    let reconnectTimer: number | null = null;
    fetch(apiUrl("/api/bootstrap"), { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("初始化失败");
        return await response.json() as BootstrapPayload;
      })
      .then((payload) => {
        if (cancelled) return;
        mergeLiveNews(payload.news);
        setMarket(payload.market);
        setSources(payload.sources);
      })
      .catch((error) => setQueryError(error instanceof Error ? error.message : "初始化失败"))
      .finally(() => !cancelled && setLoading(false));

    const markStreamActive = (source: EventSource) => {
      if (events !== source) return false;
      lastStreamActivityAt = Date.now();
      setConnected(true);
      return true;
    };

    const clearReconnectTimer = () => {
      if (reconnectTimer === null) return;
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    };

    const scheduleStreamReconnect = () => {
      if (cancelled || document.visibilityState !== "visible" || reconnectTimer !== null) return;
      const delay = Math.min(30_000, 1_500 * 2 ** Math.min(reconnectAttempt, 4));
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connectStream(true);
      }, delay);
    };

    const connectStream = (force = false) => {
      if (cancelled) return;
      if (!force && events && events.readyState !== EventSource.CLOSED) return;
      if (force) clearReconnectTimer();
      events?.close();
      setConnected(false);
      lastStreamActivityAt = Date.now();
      const streamUrl = new URL(apiUrl("/api/stream"), window.location.href);
      streamUrl.searchParams.set("client", streamClientId.current);
      const recoveryFrom = liveRecoveryFrom(latestLiveNewsAt.current);
      if (recoveryFrom) streamUrl.searchParams.set("from", recoveryFrom);
      const nextEvents = new EventSource(streamUrl.toString());
      events = nextEvents;
      nextEvents.onopen = () => {
        if (events !== nextEvents) return;
        reconnectAttempt = 0;
        clearReconnectTimer();
        markStreamActive(nextEvents);
        if (Date.now() - lastLiveNewsSyncAt.current > 5_000) void syncLiveNews();
      };
      nextEvents.onerror = () => {
        if (events !== nextEvents) return;
        nextEvents.close();
        events = null;
        setConnected(false);
        const recoveryAt = Date.now();
        if (recoveryAt - lastRecoveryAt >= 1_000) {
          lastRecoveryAt = recoveryAt;
          void syncLiveNews();
        }
        // Native EventSource retries every few seconds indefinitely. Mobile
        // network changes can turn that into a reconnect storm, so retry with a
        // bounded backoff while the periodic HTTP sync fills any gap.
        scheduleStreamReconnect();
      };
      nextEvents.addEventListener("heartbeat", () => markStreamActive(nextEvents));
      nextEvents.addEventListener("news", (event) => {
        if (!markStreamActive(nextEvents)) return;
        const incoming = JSON.parse((event as MessageEvent<string>).data) as NewsItem[];
        mergeLiveNews(incoming);
      });
      nextEvents.addEventListener("market", (event) => {
        if (!markStreamActive(nextEvents)) return;
        setMarket(JSON.parse((event as MessageEvent<string>).data) as MarketSnapshot);
      });
      nextEvents.addEventListener("sources", (event) => {
        if (!markStreamActive(nextEvents)) return;
        setSources(JSON.parse((event as MessageEvent<string>).data) as SourceStatus[]);
      });
      nextEvents.addEventListener("analysis", (event) => {
        if (!markStreamActive(nextEvents)) return;
        const invalidation = JSON.parse((event as MessageEvent<string>).data) as { generatedAt: string };
        setAnalysisRevision(invalidation.generatedAt);
      });
    };

    connectStream();

    const recoverLiveConnection = () => {
      if (document.visibilityState !== "visible") return;
      const recoveryAt = Date.now();
      if (recoveryAt - lastRecoveryAt < 1_000) return;
      lastRecoveryAt = recoveryAt;
      reconnectAttempt = 0;
      clearReconnectTimer();
      void syncLiveNews(true);
      connectStream(true);
    };
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") recoverLiveConnection();
    };
    const liveSyncTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void syncLiveNews();
    }, liveNewsSyncIntervalMs);
    const watchdog = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastStreamActivityAt > streamStaleMs) connectStream(true);
    }, 8_000);
    document.addEventListener("visibilitychange", syncWhenVisible);
    window.addEventListener("online", recoverLiveConnection);
    window.addEventListener("pageshow", recoverLiveConnection);
    window.addEventListener("focus", recoverLiveConnection);
    return () => {
      cancelled = true;
      clearReconnectTimer();
      window.clearInterval(liveSyncTimer);
      window.clearInterval(watchdog);
      document.removeEventListener("visibilitychange", syncWhenVisible);
      window.removeEventListener("online", recoverLiveConnection);
      window.removeEventListener("pageshow", recoverLiveConnection);
      window.removeEventListener("focus", recoverLiveConnection);
      liveNewsSyncController.current?.abort();
      liveNewsSyncController.current = null;
      events?.close();
    };
  }, [mergeLiveNews, syncLiveNews]);

  const replayTimeline = useMemo(() => {
    if (!replay) return [];
    return Array.from(new Set([
      ...replay.news.map((item) => item.publishedAt),
      ...replay.market.points.map((point) => point.timestamp),
    ])).sort();
  }, [replay]);

  useEffect(() => {
    if (mode !== "replay" || !playing || replayTimeline.length < 2) return;
    const timer = window.setInterval(() => {
      setReplayIndex((current) => {
        if (current >= replayTimeline.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, Math.max(90, 900 / speed));
    return () => window.clearInterval(timer);
  }, [mode, playing, replayTimeline.length, speed]);

  const replayTime = replayTimeline[replayIndex];
  const replayNews = useMemo(() => {
    if (!replay || !replayTime) return [];
    return replay.news.filter((item) => item.publishedAt <= replayTime).reverse();
  }, [replay, replayTime]);
  const replayMarket = useMemo<MarketSnapshot | null>(() => {
    if (!replay || !replayTime) return null;
    return { ...replay.market, points: replay.market.points.filter((point) => point.timestamp <= replayTime) };
  }, [replay, replayTime]);

  const rawItems = mode === "live" ? liveNews : mode === "history" ? historyNews : replayNews;
  const visibleItems = useMemo(() => rawItems.filter((item) => selectedSources.size === 0 || selectedSources.has(item.source)), [rawItems, selectedSources]);
  const visibleMarket = mode === "replay" ? replayMarket : market;

  function toggleSource(source: SourceId) {
    setSelectedSources((current) => {
      if (current.size === 0) return new Set([source]);
      const next = new Set(current);
      if (next.has(source)) next.delete(source); else next.add(source);
      return next.size === sources.length || next.size === 0 ? new Set() : next;
    });
  }

  function validateRange() {
    try {
      const start = fromBeijingInput(from);
      const end = fromBeijingInput(to);
      if (start >= end) throw new Error("结束时间需晚于起始时间");
      return { start, end };
    } catch {
      setQueryError("请填写有效的起止时间");
      return null;
    }
  }

  async function runSearch() {
    const range = validateRange();
    if (!range) return;
    setQueryBusy(true);
    setQueryError(null);
    try {
      const params = new URLSearchParams({ from: range.start, to: range.end, limit: "1000", remote: "1" });
      if (query.trim()) params.set("q", query.trim());
      if (selectedSources.size) params.set("source", Array.from(selectedSources).join(","));
      const response = await fetch(`${apiUrl("/api/news")}?${params}`);
      if (!response.ok) throw new Error("查询失败");
      const payload = await response.json() as { items: NewsItem[] };
      setHistoryNews(payload.items);
      setMode("history");
      setQueryOpen(false);
    } catch (error) {
      setQueryError(error instanceof Error ? error.message : "查询失败");
    } finally {
      setQueryBusy(false);
    }
  }

  async function runReplay() {
    const range = validateRange();
    if (!range) return;
    setQueryBusy(true);
    setQueryError(null);
    try {
      const response = await fetch(`${apiUrl("/api/replay")}?${new URLSearchParams({ from: range.start, to: range.end })}`);
      const payload = await response.json() as ReplayPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error || "回放加载失败");
      if (!payload.news.length && !payload.market.points.length) throw new Error("该时间段尚无可回放数据");
      setReplay(payload);
      setReplayIndex(0);
      setMode("replay");
      setPlaying(true);
      setQueryOpen(false);
    } catch (error) {
      setQueryError(error instanceof Error ? error.message : "回放加载失败");
    } finally {
      setQueryBusy(false);
    }
  }

  function returnLive() {
    setMode("live");
    setPlaying(false);
    setReplay(null);
  }

  function scrollToInsights() {
    document.getElementById("market-insights")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <div className="app-shell">
      <Header
        connected={connected}
        serverTime={new Date(now).toISOString()}
        sources={sources}
        theme={theme}
        onInsightsClick={scrollToInsights}
        onThemeChange={setTheme}
      />
      <div className="workspace-scroll">
        <main className="dashboard">
          <NewsFeed
            items={visibleItems}
            mode={mode}
            sources={sources}
            selectedSources={selectedSources}
            now={now}
            loading={loading}
            replayTime={replayTime}
            onModeLive={returnLive}
            onToggleSource={toggleSource}
            onOpenQuery={() => { setQueryError(null); setQueryOpen(true); }}
          />
          <div className="market-column">
            <MarketChart market={visibleMarket} replaying={mode === "replay"} />
            {mode === "replay" ? (
              <ReplayBar
                current={replayIndex}
                total={replayTimeline.length}
                timestamp={replayTime}
                playing={playing}
                speed={speed}
                onPlayingChange={setPlaying}
                onCurrentChange={(value) => { setReplayIndex(value); setPlaying(false); }}
                onSpeedChange={setSpeed}
                onClose={returnLive}
              />
            ) : null}
          </div>
        </main>
        {!loading ? (
          <Suspense fallback={<InsightsFallback />}>
            <InsightsDashboard revision={analysisRevision} />
          </Suspense>
        ) : <InsightsFallback />}
      </div>

      {queryOpen ? <QueryPanel from={from} to={to} query={query} busy={queryBusy} error={queryError} onFromChange={setFrom} onToChange={setTo} onQueryChange={setQuery} onClose={() => setQueryOpen(false)} onSearch={runSearch} onReplay={runReplay} /> : null}
    </div>
  );
}
