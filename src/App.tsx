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
  const latestLiveNewsAt = useRef<string | null>(null);
  const syncingLiveNews = useRef(false);

  const mergeLiveNews = useCallback((incoming: NewsItem[]) => {
    setLiveNews((current) => {
      const merged = uniqueNews([...incoming, ...current])
        .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
        .slice(0, 500);
      latestLiveNewsAt.current = merged[0]?.publishedAt || null;
      return merged;
    });
  }, []);

  const syncLiveNews = useCallback(async () => {
    if (syncingLiveNews.current) return;
    syncingLiveNews.current = true;
    try {
      const params = new URLSearchParams({ limit: "200", _: String(Date.now()) });
      if (latestLiveNewsAt.current) {
        const overlap = new Date(new Date(latestLiveNewsAt.current).getTime() - 60_000).toISOString();
        params.set("from", overlap);
      }
      const response = await fetch(`${apiUrl("/api/news")}?${params}`);
      if (!response.ok) return;
      const payload = await response.json() as { items: NewsItem[] };
      mergeLiveNews(payload.items);
    } catch {
      // EventSource will keep reconnecting; the next foreground sync retries missed items.
    } finally {
      syncingLiveNews.current = false;
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
    fetch(apiUrl("/api/bootstrap"))
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

    const events = new EventSource(apiUrl("/api/stream"));
    events.onopen = () => {
      setConnected(true);
      void syncLiveNews();
    };
    events.onerror = () => setConnected(false);
    events.addEventListener("news", (event) => {
      const incoming = JSON.parse((event as MessageEvent<string>).data) as NewsItem[];
      mergeLiveNews(incoming);
    });
    events.addEventListener("market", (event) => setMarket(JSON.parse((event as MessageEvent<string>).data) as MarketSnapshot));
    events.addEventListener("sources", (event) => setSources(JSON.parse((event as MessageEvent<string>).data) as SourceStatus[]));

    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") void syncLiveNews();
    };
    const syncWhenOnline = () => void syncLiveNews();
    const fallbackTimer = window.setInterval(syncWhenVisible, 30_000);
    document.addEventListener("visibilitychange", syncWhenVisible);
    window.addEventListener("online", syncWhenOnline);
    window.addEventListener("pageshow", syncWhenOnline);
    return () => {
      cancelled = true;
      window.clearInterval(fallbackTimer);
      document.removeEventListener("visibilitychange", syncWhenVisible);
      window.removeEventListener("online", syncWhenOnline);
      window.removeEventListener("pageshow", syncWhenOnline);
      events.close();
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
            <InsightsDashboard />
          </Suspense>
        ) : <InsightsFallback />}
      </div>

      {queryOpen ? <QueryPanel from={from} to={to} query={query} busy={queryBusy} error={queryError} onFromChange={setFrom} onToChange={setTo} onQueryChange={setQuery} onClose={() => setQueryOpen(false)} onSearch={runSearch} onReplay={runReplay} /> : null}
    </div>
  );
}
