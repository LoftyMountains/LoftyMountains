import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NEWS_QUERY_MAX_LIMIT, type BootstrapPayload, type FeedNewsItem, type MarketSnapshot, type SourceId, type SourceStatus } from "../shared/types";
import { Header } from "./components/Header";
import { MarketChart } from "./components/MarketChart";
import { NewsFeed, type FeedViewMode, type ViewMode } from "./components/NewsFeed";
import { QueryPanel } from "./components/QueryPanel";
import { ReplayBar } from "./components/ReplayBar";
import { apiUrl } from "./lib/api";
import { groupNewsEvents } from "./lib/news-events";
import { parseNewsQueryResponse, type NewsQueryCompleteness } from "./lib/news-query";
import {
  DEFAULT_REPLAY_SPEED,
  clampReplayCursor,
  isReplaySpeed,
  parseReplayResponse,
  replayCursorFromElapsed,
  replaySpeedLabel,
  visibleReplayItemCount,
  type ReplaySpeed,
  type ValidatedReplay,
} from "./lib/replay-clock";
import { applyThemeMode, readThemeMode, type ThemeMode } from "./lib/theme";
import { formatFull, fromBeijingInput, toBeijingInput } from "./lib/time";
import { latestTrustedTimestamp } from "./lib/live-freshness";

function uniqueNews(items: FeedNewsItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id)));
}

const liveNewsSyncIntervalMs = 4_000;
const liveNewsOverlapMs = 3 * 60_000;
const streamStaleMs = 35_000;
const streamClientStorageKey = "jingxing-stream-client";

interface HistoryQueryState {
  items: FeedNewsItem[];
  completeness: NewsQueryCompleteness | null;
  revision: number;
}

interface ReplaySession {
  generation: number;
  replay: ValidatedReplay;
  cursorMs: number;
  playing: boolean;
  announcement: string;
  announcementRevision: number;
}

interface ReplayAnchor {
  generation: number;
  cursorMs: number;
  monotonicMs: number;
  speed: ReplaySpeed;
}

function replayCursorAt(session: ReplaySession, anchor: ReplayAnchor | null, monotonicMs: number) {
  if (!anchor || anchor.generation !== session.generation || !session.playing) return session.cursorMs;
  return replayCursorFromElapsed(
    anchor.cursorMs,
    monotonicMs - anchor.monotonicMs,
    anchor.speed,
    session.replay.fromMs,
    session.replay.toMs,
  );
}

function replayAnnouncement(action: string, cursorMs: number) {
  return `${action}，北京时间 ${formatFull(cursorMs)}`;
}

function apiError(payload: unknown, fallback: string) {
  if (typeof payload !== "object" || payload === null || !("error" in payload)) return fallback;
  return typeof payload.error === "string" && payload.error.trim() ? payload.error : fallback;
}

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
      <div className="insights-workbench" />
    </section>
  );
}

export function App() {
  const [liveNews, setLiveNews] = useState<FeedNewsItem[]>([]);
  const [historyQuery, setHistoryQuery] = useState<HistoryQueryState>({ items: [], completeness: null, revision: 0 });
  const [market, setMarket] = useState<MarketSnapshot | null>(null);
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [connected, setConnected] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<"initializing" | "connected" | "reconnecting" | "error">("initializing");
  const [realtimeError, setRealtimeError] = useState<string | null>(null);
  const [retryingConnection, setRetryingConnection] = useState(false);
  const [realtimeAnnouncement, setRealtimeAnnouncement] = useState("");
  const [realtimeAnnouncementRevision, setRealtimeAnnouncementRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ViewMode>("live");
  const [selectedSources, setSelectedSources] = useState<Set<SourceId>>(new Set());
  const [queryOpen, setQueryOpen] = useState(false);
  const [queryBusy, setQueryBusy] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [from, setFrom] = useState(() => toBeijingInput(new Date(Date.now() - 4 * 60 * 60 * 1000)));
  const [to, setTo] = useState(() => toBeijingInput(new Date()));
  const [query, setQuery] = useState("");
  const [replaySession, setReplaySession] = useState<ReplaySession | null>(null);
  const [replaySpeed, setReplaySpeed] = useState<ReplaySpeed>(DEFAULT_REPLAY_SPEED);
  const [now, setNow] = useState(Date.now());
  const [theme, setTheme] = useState<ThemeMode>(readThemeMode);
  const [analysisRevision, setAnalysisRevision] = useState<string | null>(null);
  const [workspaceView, setWorkspaceView] = useState<"live" | "insights">("live");
  const [feedView, setFeedView] = useState<FeedViewMode>("events");
  const latestLiveNewsAt = useRef<string | null>(null);
  const liveNewsSyncController = useRef<AbortController | null>(null);
  const lastLiveNewsSyncAt = useRef(0);
  const streamClientId = useRef(createStreamClientId());
  const queryOperation = useRef<AbortController | null>(null);
  const replayGeneration = useRef(0);
  const replayAnchor = useRef<ReplayAnchor | null>(null);
  const retryConnectionRef = useRef<(() => Promise<void>) | null>(null);
  const cancelRetryRef = useRef<(() => void) | null>(null);
  const retryingConnectionRef = useRef(false);
  const retryCancelledRef = useRef(false);
  const retryGenerationRef = useRef(0);
  const bootstrapReadyRef = useRef(false);
  const bootstrapSettledRef = useRef(false);
  const lastAnnouncementRef = useRef<string | null>(null);
  const hadConnectedRef = useRef(false);
  const connectedRef = useRef(false);
  const marketRef = useRef<MarketSnapshot | null>(null);
  const sourcesRef = useRef<SourceStatus[]>([]);

  const announceRealtime = useCallback((message: string) => {
    if (!message || lastAnnouncementRef.current === message) return;
    lastAnnouncementRef.current = message;
    setRealtimeAnnouncement(message);
    setRealtimeAnnouncementRevision((value) => value + 1);
  }, []);

  const mergeLiveNews = useCallback((incoming: FeedNewsItem[]) => {
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
      if (!response.ok) return false;
      const payload = await response.json() as { items: FeedNewsItem[] };
      mergeLiveNews(payload.items);
      return true;
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
        marketRef.current = payload.market;
        sourcesRef.current = payload.sources;
        bootstrapReadyRef.current = true;
        setRealtimeStatus("initializing");
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "初始化失败";
        setQueryError(message);
        setRealtimeError(message);
        bootstrapReadyRef.current = false;
        setRealtimeStatus("error");
        announceRealtime(message);
      })
      .finally(() => {
        if (cancelled) return;
        bootstrapSettledRef.current = true;
        setLoading(false);
        if (bootstrapReadyRef.current) connectStream();
      });

    const markStreamActive = (source: EventSource) => {
      if (events !== source || !bootstrapReadyRef.current) return false;
      lastStreamActivityAt = Date.now();
      setConnected(true);
      const recovered = hadConnectedRef.current && !connectedRef.current;
      connectedRef.current = true;
      hadConnectedRef.current = true;
      setRealtimeStatus("connected");
      setRealtimeError(null);
      if (recovered) {
        const latest = latestTrustedTimestamp([
          marketRef.current?.lastSuccessAt,
          ...sourcesRef.current.map((source) => source.lastSuccessAt),
        ]);
        announceRealtime(`实时连接已恢复${latest ? `，数据截至北京时间 ${formatFull(latest)}` : ""}`);
      }
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
      if (cancelled || !bootstrapSettledRef.current || !bootstrapReadyRef.current) return;
      if (!force && events && events.readyState !== EventSource.CLOSED) return;
      if (force) clearReconnectTimer();
      events?.close();
      setConnected(false);
      connectedRef.current = false;
      setRealtimeStatus("reconnecting");
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
        connectedRef.current = false;
        setRealtimeStatus("reconnecting");
        if (!retryingConnectionRef.current) announceRealtime("实时连接中断，正在重连");
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
        const incoming = JSON.parse((event as MessageEvent<string>).data) as FeedNewsItem[];
        mergeLiveNews(incoming);
      });
      nextEvents.addEventListener("market", (event) => {
        if (!markStreamActive(nextEvents)) return;
        const nextMarket = JSON.parse((event as MessageEvent<string>).data) as MarketSnapshot;
        marketRef.current = nextMarket;
        setMarket(nextMarket);
      });
      nextEvents.addEventListener("sources", (event) => {
        if (!markStreamActive(nextEvents)) return;
        const nextSources = JSON.parse((event as MessageEvent<string>).data) as SourceStatus[];
        sourcesRef.current = nextSources;
        setSources(nextSources);
      });
      nextEvents.addEventListener("analysis", (event) => {
        if (!markStreamActive(nextEvents)) return;
        const invalidation = JSON.parse((event as MessageEvent<string>).data) as { generatedAt: string };
        setAnalysisRevision(invalidation.generatedAt);
      });
    };

    retryConnectionRef.current = async () => {
      if (cancelled || retryingConnectionRef.current) return;
      retryingConnectionRef.current = true;
      const retryGeneration = ++retryGenerationRef.current;
      retryCancelledRef.current = false;
      // A failed bootstrap still allows the user to recover the stream and
      // any available domains; the retry path is the explicit initialization
      // recovery boundary.
      bootstrapReadyRef.current = true;
      setRetryingConnection(true);
      setRealtimeStatus("reconnecting");
      setRealtimeError(null);
      announceRealtime("正在重连");
      const synced = await syncLiveNews(true);
      if (cancelled || retryGeneration !== retryGenerationRef.current || retryCancelledRef.current) return;
      connectStream(true);
      if (!synced) {
        const message = "重试连接失败，请稍后再次重试";
        setRealtimeError(message);
        setRealtimeStatus("error");
        announceRealtime(message);
      }
      retryingConnectionRef.current = false;
      setRetryingConnection(false);
    };
    cancelRetryRef.current = () => {
      if (!retryingConnectionRef.current) return;
      retryCancelledRef.current = true;
      retryGenerationRef.current += 1;
      liveNewsSyncController.current?.abort();
      retryingConnectionRef.current = false;
      setRetryingConnection(false);
      setRealtimeStatus("error");
      const message = "已取消重试，可再次重试连接";
      setRealtimeError(message);
      announceRealtime(message);
    };

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
      retryConnectionRef.current = null;
      cancelRetryRef.current = null;
    };
  }, [announceRealtime, mergeLiveNews, syncLiveNews]);

  useEffect(() => {
    if (mode !== "replay" || !replaySession?.playing) {
      replayAnchor.current = null;
      return;
    }
    const anchor: ReplayAnchor = {
      generation: replaySession.generation,
      cursorMs: replaySession.cursorMs,
      monotonicMs: performance.now(),
      speed: replaySpeed,
    };
    replayAnchor.current = anchor;
    const timer = window.setInterval(() => {
      const monotonicMs = performance.now();
      setReplaySession((current) => {
        if (!current || !current.playing || current.generation !== anchor.generation) return current;
        const cursorMs = replayCursorAt(current, anchor, monotonicMs);
        if (cursorMs >= current.replay.toMs) {
          if (replayAnchor.current === anchor) replayAnchor.current = null;
          return {
            ...current,
            cursorMs: current.replay.toMs,
            playing: false,
            announcement: "回放结束",
            announcementRevision: current.announcementRevision + 1,
          };
        }
        return cursorMs === current.cursorMs ? current : { ...current, cursorMs };
      });
    }, 100);
    return () => {
      window.clearInterval(timer);
      if (replayAnchor.current === anchor) replayAnchor.current = null;
    };
  }, [mode, replaySession?.generation, replaySession?.playing, replaySpeed]);

  useEffect(() => {
    const pauseInBackground = () => {
      const anchor = replayAnchor.current;
      const monotonicMs = performance.now();
      replayAnchor.current = null;
      setReplaySession((current) => {
        if (!current?.playing) return current;
        const cursorMs = replayCursorAt(current, anchor, monotonicMs);
        const ended = cursorMs >= current.replay.toMs;
        return {
          ...current,
          cursorMs: ended ? current.replay.toMs : cursorMs,
          playing: false,
          announcement: ended ? "回放结束" : replayAnnouncement("页面进入后台，回放已暂停", cursorMs),
          announcementRevision: current.announcementRevision + 1,
        };
      });
    };
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") pauseInBackground();
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) pauseInBackground();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", pauseInBackground);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", pauseInBackground);
      window.removeEventListener("pageshow", handlePageShow);
      replayAnchor.current = null;
    };
  }, []);

  useEffect(() => () => {
    queryOperation.current?.abort();
    queryOperation.current = null;
  }, []);

  const replayTime = replaySession ? new Date(replaySession.cursorMs).toISOString() : undefined;
  const replayNews = useMemo(() => {
    if (!replaySession) return [];
    const count = visibleReplayItemCount(replaySession.replay.newsTimes, replaySession.cursorMs);
    return replaySession.replay.payload.news.slice(0, count).reverse();
  }, [replaySession]);
  const replayMarket = useMemo<MarketSnapshot | null>(() => {
    if (!replaySession) return null;
    const count = visibleReplayItemCount(replaySession.replay.marketTimes, replaySession.cursorMs);
    const points = replaySession.replay.payload.market.points.slice(0, count);
    const latestTimestamp = points.at(-1)?.timestamp;
    return {
      ...replaySession.replay.payload.market,
      points,
      updatedAt: latestTimestamp || new Date(0).toISOString(),
      lastSuccessAt: latestTimestamp || null,
    };
  }, [replaySession]);

  const rawItems = mode === "live" ? liveNews : mode === "history" ? historyQuery.items : replayNews;
  const visibleItems = useMemo(() => rawItems.filter((item) => selectedSources.size === 0 || selectedSources.has(item.source)), [rawItems, selectedSources]);
  const visibleEvents = useMemo(() => groupNewsEvents(visibleItems), [visibleItems]);
  const visibleMarket = mode === "replay" ? replayMarket : market;
  const latestMarketSuccessAt = latestTrustedTimestamp([market?.lastSuccessAt], now);
  const affected = sources.filter((source) => source.state === "delayed" || source.state === "offline");
  const marketAffected = Boolean(market?.delayed || (market && !latestMarketSuccessAt));
  const freshnessLabel = realtimeStatus === "initializing"
    ? "正在连接"
    : realtimeStatus === "connected"
      ? affected.length || marketAffected ? "部分数据源异常，数据可能陈旧" : "实时连接正常"
      : realtimeStatus === "error" ? "实时连接失败，数据可能陈旧" : "实时连接中断，正在重连；数据可能陈旧";
  const freshnessDetails = [
    "新闻最近成功时间未知",
    `行情最近成功时间${latestMarketSuccessAt ? `北京时间 ${formatFull(latestMarketSuccessAt)}` : "未知"}`,
    ...affected.map((source) => `${source.label}${source.state === "offline" ? "离线" : "延迟"}，最近成功时间${latestTrustedTimestamp([source.lastSuccessAt], now) ? `北京时间 ${formatFull(latestTrustedTimestamp([source.lastSuccessAt], now)!)}` : "未知"}${source.message ? `：${source.message}` : ""}`),
  ];

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

  function pauseReplay(action = "回放已暂停") {
    const anchor = replayAnchor.current;
    const monotonicMs = performance.now();
    replayAnchor.current = null;
    setReplaySession((current) => {
      if (!current?.playing) return current;
      const cursorMs = replayCursorAt(current, anchor, monotonicMs);
      const ended = cursorMs >= current.replay.toMs;
      return {
        ...current,
        cursorMs: ended ? current.replay.toMs : cursorMs,
        playing: false,
        announcement: ended ? "回放结束" : replayAnnouncement(action, cursorMs),
        announcementRevision: current.announcementRevision + 1,
      };
    });
  }

  function changeReplayPlaying(playing: boolean) {
    if (!playing) {
      pauseReplay();
      return;
    }
    replayAnchor.current = null;
    setReplaySession((current) => {
      if (!current) return current;
      const restarting = current.cursorMs >= current.replay.toMs;
      const cursorMs = restarting ? current.replay.fromMs : current.cursorMs;
      return {
        ...current,
        cursorMs,
        playing: true,
        announcement: replayAnnouncement(restarting ? "重新播放" : "开始播放", cursorMs),
        announcementRevision: current.announcementRevision + 1,
      };
    });
  }

  function changeReplayCursor(cursorMs: number, announce: boolean) {
    replayAnchor.current = null;
    setReplaySession((current) => {
      if (!current) return current;
      const nextCursorMs = clampReplayCursor(cursorMs, current.replay.fromMs, current.replay.toMs);
      const ended = nextCursorMs >= current.replay.toMs;
      return {
        ...current,
        cursorMs: nextCursorMs,
        playing: false,
        ...(announce ? {
          announcement: ended ? "回放结束" : replayAnnouncement("已跳转", nextCursorMs),
          announcementRevision: current.announcementRevision + 1,
        } : {}),
      };
    });
  }

  function changeReplaySpeed(value: number) {
    if (!isReplaySpeed(value)) return;
    const anchor = replayAnchor.current;
    const monotonicMs = performance.now();
    replayAnchor.current = null;
    setReplaySession((current) => {
      if (!current) return current;
      const cursorMs = replayCursorAt(current, anchor, monotonicMs);
      const ended = cursorMs >= current.replay.toMs;
      return {
        ...current,
        cursorMs: ended ? current.replay.toMs : cursorMs,
        playing: ended ? false : current.playing,
        announcement: ended ? "回放结束" : `回放速率已设为 ${replaySpeedLabel(value)}`,
        announcementRevision: current.announcementRevision + 1,
      };
    });
    setReplaySpeed(value);
  }

  async function runSearch() {
    if (queryOperation.current) return;
    const range = validateRange();
    if (!range) return;
    const controller = new AbortController();
    pauseReplay();
    queryOperation.current = controller;
    setQueryBusy(true);
    setQueryError(null);
    try {
      const params = new URLSearchParams({ from: range.start, to: range.end, limit: String(NEWS_QUERY_MAX_LIMIT), remote: "1" });
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`${apiUrl("/api/news")}?${params}`, { signal: controller.signal });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(payload, "查询失败"));
      const parsed = parseNewsQueryResponse(payload);
      setHistoryQuery((current) => ({
        items: parsed.items,
        completeness: parsed.completeness,
        revision: current.revision + 1,
      }));
      setMode("history");
      setQueryOpen(false);
    } catch (error) {
      setQueryError(error instanceof Error ? error.message : "查询失败");
    } finally {
      if (queryOperation.current === controller) {
        queryOperation.current = null;
        setQueryBusy(false);
      }
    }
  }

  async function runReplay() {
    if (queryOperation.current) return;
    const range = validateRange();
    if (!range) return;
    const controller = new AbortController();
    pauseReplay();
    queryOperation.current = controller;
    setQueryBusy(true);
    setQueryError(null);
    try {
      const response = await fetch(`${apiUrl("/api/replay")}?${new URLSearchParams({ from: range.start, to: range.end })}`, { signal: controller.signal });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(payload, "回放加载失败"));
      const parsed = parseReplayResponse(payload);
      if (!parsed.payload.news.length && !parsed.payload.market.points.length) throw new Error("该时间段尚无可回放数据");
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      const generation = replayGeneration.current + 1;
      replayGeneration.current = generation;
      replayAnchor.current = null;
      setReplaySpeed(DEFAULT_REPLAY_SPEED);
      setReplaySession({
        generation,
        replay: parsed,
        cursorMs: parsed.fromMs,
        playing: !reducedMotion,
        announcement: reducedMotion
          ? replayAnnouncement("回放已加载并暂停", parsed.fromMs)
          : replayAnnouncement("开始播放", parsed.fromMs),
        announcementRevision: 1,
      });
      setMode("replay");
      setQueryOpen(false);
    } catch (error) {
      setQueryError(error instanceof Error ? error.message : "回放加载失败");
    } finally {
      if (queryOperation.current === controller) {
        queryOperation.current = null;
        setQueryBusy(false);
      }
    }
  }

  function returnLive() {
    replayAnchor.current = null;
    setMode("live");
    setHistoryQuery({ items: [], completeness: null, revision: 0 });
    setReplaySession(null);
  }

  return (
    <div className={`app-shell is-${workspaceView}`}>
      <Header
        connected={connected}
        serverTime={new Date(now).toISOString()}
        sources={sources}
        theme={theme}
        insightsActive={workspaceView === "insights"}
        onInsightsClick={() => setWorkspaceView((current) => current === "live" ? "insights" : "live")}
        onThemeChange={setTheme}
      />
      {mode === "live" ? (
        <div className={`realtime-freshness is-${realtimeStatus}`} aria-busy={retryingConnection}>
          <span className="realtime-freshness-dot" aria-hidden="true" />
          <span className="realtime-freshness-copy">
            <strong>{freshnessLabel}</strong>
            <span>{freshnessDetails.join("；")}</span>
          </span>
          {realtimeError ? <span className="realtime-freshness-error" role="alert">{realtimeError}</span> : null}
          {realtimeStatus !== "connected" || affected.length || marketAffected ? (
            <button type="button" className="realtime-retry" disabled={retryingConnection} onClick={() => void retryConnectionRef.current?.()}>
              {retryingConnection ? "正在重连" : "重试连接"}
            </button>
          ) : null}
          {retryingConnection ? <button type="button" className="realtime-retry realtime-cancel" onClick={() => cancelRetryRef.current?.()}>取消重试</button> : null}
          <span className="sr-only" role="status" key={realtimeAnnouncementRevision}>{realtimeAnnouncement}</span>
        </div>
      ) : null}
      <div className="workspace-scroll">
        {workspaceView === "live" ? (
          <div className="workspace-page">
            <main className="dashboard">
              <NewsFeed
                items={visibleItems}
                events={visibleEvents}
                feedView={feedView}
                mode={mode}
                sources={sources}
                selectedSources={selectedSources}
                now={now}
                replayCursorMs={mode === "replay" && replaySession ? replaySession.cursorMs : undefined}
                replayPlaying={mode === "replay" && replaySession ? replaySession.playing : false}
                replayEnded={mode === "replay" && replaySession ? replaySession.cursorMs >= replaySession.replay.toMs : false}
                loading={loading}
                error={mode === "live" && !liveNews.length ? queryError : null}
                replayTime={replayTime}
                historyCompleteness={historyQuery.completeness}
                historyCompletenessRevision={historyQuery.revision}
                historyReturnedCount={historyQuery.items.length}
                onModeLive={returnLive}
                onFeedViewChange={setFeedView}
                onToggleSource={toggleSource}
                onClearSources={() => setSelectedSources(new Set())}
                onOpenQuery={() => { setQueryError(null); setQueryOpen(true); }}
              />
              <div className="market-column">
                <MarketChart market={visibleMarket} replaying={mode === "replay"} />
                {mode === "replay" && replaySession ? (
                  <ReplayBar
                    fromMs={replaySession.replay.fromMs}
                    toMs={replaySession.replay.toMs}
                    cursorMs={replaySession.cursorMs}
                    playing={replaySession.playing}
                    speed={replaySpeed}
                    announcement={replaySession.announcement}
                    announcementRevision={replaySession.announcementRevision}
                    onPlayingChange={changeReplayPlaying}
                    onCursorChange={(value) => changeReplayCursor(value, false)}
                    onCursorCommit={(value) => changeReplayCursor(value, true)}
                    onSpeedChange={changeReplaySpeed}
                    onClose={returnLive}
                  />
                ) : null}
              </div>
            </main>
          </div>
        ) : (
          <div className="workspace-page">
            {!loading ? (
              <Suspense fallback={<InsightsFallback />}>
                <InsightsDashboard revision={analysisRevision} />
              </Suspense>
            ) : <InsightsFallback />}
          </div>
        )}
      </div>

      {queryOpen ? <QueryPanel from={from} to={to} query={query} busy={queryBusy} error={queryError} onFromChange={setFrom} onToChange={setTo} onQueryChange={setQuery} onClose={() => setQueryOpen(false)} onSearch={runSearch} onReplay={runReplay} /> : null}
    </div>
  );
}
