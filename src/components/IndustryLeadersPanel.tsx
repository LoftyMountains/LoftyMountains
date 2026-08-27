import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, CircleAlert, DatabaseZap, LoaderCircle, PanelTopClose, PanelTopOpen, Search, TrendingUp } from "lucide-react";
import type { IndustryCatalogEntry, IndustryLeaderLiveQuotesPayload, IndustryLeaderStock, IndustryLeadersPayload } from "../../shared/types";
import { apiUrl } from "../lib/api";
import { formatClock, formatFull } from "../lib/time";

const payloadCache = new Map<string, { payload: IndustryLeadersPayload; etag: string | null; fetchedAt: number }>();
const cacheMs = 60_000;
const catalogCollapsedStorageKey = "jingxing.industry-catalog-collapsed-v2";

function signedPercent(value: number | null) {
  if (value === null) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function compactMoney(value: number | null, currency: IndustryLeaderStock["quote"]["marketCapCurrency"]) {
  if (value === null || currency === null) return "--";
  const prefix = currency === "CNY" ? "¥" : currency === "HKD" ? "HK$" : "$";
  return `${prefix}${new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value)}`;
}

function compactPrice(stock: IndustryLeaderStock) {
  const value = stock.quote.price;
  if (value === null) return "--";
  const prefix = stock.quote.currency === "CNY" ? "¥" : stock.quote.currency === "HKD" ? "HK$" : "$";
  return `${prefix}${value.toLocaleString("zh-CN", { maximumFractionDigits: 3 })}`;
}

function quoteTone(stock: IndustryLeaderStock) {
  const change = stock.quote.changePercent;
  return change === null || change === 0 ? "is-flat" : change > 0 ? "is-up" : "is-down";
}

function LeaderRow({ stock, rank }: { stock: IndustryLeaderStock; rank: number }) {
  const available = stock.quote.status === "available";
  const quoteState = stock.quote.tradingState === "trading" && stock.quote.realtime
    ? { label: "实时", className: "is-live" }
    : stock.quote.tradingState === "trading"
      ? { label: "延时", className: "is-delayed" }
    : stock.quote.tradingState === "closed"
      ? { label: "收盘", className: "is-closed" }
      : { label: "快照", className: "is-snapshot" };
  return (
    <article className={`industry-leader-row ${quoteTone(stock)} ${available ? "" : "is-unavailable"}`}>
      <span className="industry-leader-rank">{String(rank).padStart(2, "0")}</span>
      <div className="industry-leader-identity">
        <div><strong title={stock.name}>{stock.name}</strong><span>{stock.symbol}</span></div>
        <div className="industry-leader-business" title={stock.business}><span>产品</span>{stock.business}</div>
        <div className="industry-leader-meta">
          <b>{stock.exchange}</b>
          <span>市值 {compactMoney(stock.quote.marketCap, stock.quote.marketCapCurrency)}</span>
          {stock.mentions ? <span>快讯 {stock.mentions}</span> : null}
        </div>
      </div>
      <div className="industry-leader-quote">
        <strong>{available ? compactPrice(stock) : "--"}</strong>
        <span>{available ? <>
          <b>{signedPercent(stock.quote.changePercent)}</b>
          <em className={quoteState.className} title={`${stock.quote.provider} · ${formatFull(stock.quote.updatedAt)}`}><i />{quoteState.label}</em>
        </> : stock.quote.reason || "行情不可用"}</span>
      </div>
    </article>
  );
}

function LeaderList({ stocks, empty, loading = false }: { stocks: IndustryLeaderStock[]; empty: string; loading?: boolean }) {
  if (loading) return <div className="industry-leader-skeleton" aria-label="正在加载候选股票">{Array.from({ length: 3 }, (_, index) => <div key={index}><i /><span /><b /></div>)}</div>;
  if (!stocks.length) return <div className="industry-leader-empty"><DatabaseZap size={19} /><span>{empty}</span></div>;
  return <div className="industry-leader-list">{stocks.map((stock, index) => <LeaderRow stock={stock} rank={index + 1} key={stock.symbol} />)}</div>;
}

export function IndustryLeadersPanel({ hours, revision }: { hours: number; revision: number }) {
  const [payload, setPayload] = useState<IndustryLeadersPayload | null>(null);
  const [selectedSubIndustry, setSelectedSubIndustry] = useState<string | null>(null);
  const [sector, setSector] = useState("全部");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bridgeMotion, setBridgeMotion] = useState<"next" | "previous" | null>(null);
  const [catalogCollapsed, setCatalogCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = window.localStorage.getItem(catalogCollapsedStorageKey);
    return stored === null ? true : stored === "true";
  });
  const requestSequence = useRef(0);
  const bridgeRef = useRef<HTMLDivElement>(null);
  const wheelAccumulator = useRef(0);
  const wheelGestureActive = useRef(false);
  const wheelGestureTimer = useRef<number | null>(null);
  const bridgeMotionTimer = useRef<number | null>(null);
  const bridgeMotionFrame = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const sequence = ++requestSequence.current;
    const params = new URLSearchParams({ hours: String(hours), limit: "4" });
    if (selectedSubIndustry) params.set("subIndustry", selectedSubIndustry);
    const key = params.toString();
    const cached = payloadCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < cacheMs && revision === 0) {
      setPayload(cached.payload);
      setLoading(false);
      setError(null);
      return () => controller.abort();
    }
    setLoading(true);
    setError(null);
    const headers = new Headers();
    if (cached?.etag) headers.set("If-None-Match", cached.etag);
    void fetch(`${apiUrl("/api/industry-leaders")}?${params}`, { headers, signal: controller.signal })
      .then(async (response) => {
        if (response.status === 304 && cached) return cached.payload;
        if (!response.ok) throw new Error("行业领航股数据加载失败");
        const next = await response.json() as IndustryLeadersPayload;
        payloadCache.set(key, { payload: next, etag: response.headers.get("ETag"), fetchedAt: Date.now() });
        return next;
      })
      .then((next) => {
        if (sequence !== requestSequence.current) return;
        setPayload(next);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        if (sequence === requestSequence.current) setError(reason instanceof Error ? reason.message : "行业领航股数据加载失败");
      })
      .finally(() => {
        if (sequence === requestSequence.current) setLoading(false);
      });
    return () => controller.abort();
  }, [hours, revision, selectedSubIndustry]);

  const quoteSymbols = useMemo(() => Object.values(payload?.leaders || {})
    .flat()
    .map((stock) => stock.symbol)
    .join(","), [payload?.leaders]);

  useEffect(() => {
    if (!quoteSymbols) return;
    let stopped = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;

    const schedule = (delayMs: number) => {
      if (!stopped) timer = window.setTimeout(() => void poll(), delayMs);
    };
    const mergeQuotes = (next: IndustryLeaderLiveQuotesPayload) => {
      setPayload((current) => {
        if (!current) return current;
        const leaders = Object.fromEntries(Object.entries(current.leaders).map(([market, stocks]) => [market, stocks.map((stock) => {
          const quote = next.quotes[stock.symbol];
          if (!quote || quote.status !== "available") return stock;
          return {
            ...stock,
            quote: {
              ...quote,
              marketCap: quote.marketCap ?? stock.quote.marketCap,
              marketCapCurrency: quote.marketCapCurrency ?? stock.quote.marketCapCurrency,
            },
          };
        })])) as IndustryLeadersPayload["leaders"];
        return { ...current, leaders };
      });
    };
    async function poll() {
      if (stopped) return;
      if (document.visibilityState === "hidden") {
        schedule(10_000);
        return;
      }
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      let pollAfterMs = 10_000;
      try {
        const params = new URLSearchParams({ symbols: quoteSymbols });
        const response = await fetch(`${apiUrl("/api/industry-leaders/quotes")}?${params}`, {
          cache: "no-store",
          signal: requestController.signal,
        });
        if (!response.ok) throw new Error("实时行情暂不可用");
        const next = await response.json() as IndustryLeaderLiveQuotesPayload;
        pollAfterMs = Math.max(5_000, Math.min(30_000, next.pollAfterMs));
        mergeQuotes(next);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
      } finally {
        if (!requestController.signal.aborted) schedule(pollAfterMs);
      }
    }
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (timer !== undefined) window.clearTimeout(timer);
      void poll();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    void poll();
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [quoteSymbols]);

  const sectors = useMemo(() => ["全部", ...Array.from(new Set((payload?.catalog || []).map((entry) => entry.sectorLabel)))], [payload]);
  const matchingCatalog = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("zh-CN");
    return (payload?.catalog || []).filter((entry) => (sector === "全部" || entry.sectorLabel === sector)
      && (!needle || `${entry.label} ${entry.id} ${entry.sectorLabel}`.toLocaleLowerCase("zh-CN").includes(needle)));
  }, [payload, query, sector]);
  const wheelCatalog = useMemo(
    () => matchingCatalog.length ? matchingCatalog : payload?.catalog || [],
    [matchingCatalog, payload?.catalog],
  );
  const activeSubIndustry = selectedSubIndustry || payload?.selectedSubIndustry;
  const activeEntry = payload?.catalog.find((entry) => entry.id === activeSubIndustry) || null;
  const activeWheelIndex = wheelCatalog.findIndex((entry) => entry.id === activeSubIndustry);
  const previousEntry = wheelCatalog.length
    ? wheelCatalog[(activeWheelIndex < 0 ? 0 : activeWheelIndex - 1 + wheelCatalog.length) % wheelCatalog.length]
    : null;
  const nextEntry = wheelCatalog.length
    ? wheelCatalog[(activeWheelIndex < 0 ? 0 : activeWheelIndex + 1) % wheelCatalog.length]
    : null;
  const universe = payload?.universe;
  const compactUsd = (value: number) => `$${new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)}`;

  const selectSubIndustry = (entry: IndustryCatalogEntry) => {
    if (entry.id === activeSubIndustry) return;
    setSelectedSubIndustry(entry.id);
  };

  const cycleSubIndustry = useCallback((direction: 1 | -1) => {
    const catalog = wheelCatalog;
    if (catalog.length < 2) return;
    const currentIndex = catalog.findIndex((entry) => entry.id === activeSubIndustry);
    const nextIndex = currentIndex < 0
      ? direction > 0 ? 0 : catalog.length - 1
      : (currentIndex + direction + catalog.length) % catalog.length;
    const next = catalog[nextIndex];
    if (!next || next.id === activeSubIndustry) return;

    if (bridgeMotionFrame.current !== null) window.cancelAnimationFrame(bridgeMotionFrame.current);
    if (bridgeMotionTimer.current !== null) window.clearTimeout(bridgeMotionTimer.current);
    setBridgeMotion(null);
    bridgeMotionFrame.current = window.requestAnimationFrame(() => {
      setBridgeMotion(direction > 0 ? "next" : "previous");
      bridgeMotionTimer.current = window.setTimeout(() => setBridgeMotion(null), 420);
    });
    setSelectedSubIndustry(next.id);
  }, [activeSubIndustry, wheelCatalog]);

  useEffect(() => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (wheelGestureTimer.current !== null) window.clearTimeout(wheelGestureTimer.current);
      wheelGestureTimer.current = window.setTimeout(() => {
        wheelGestureActive.current = false;
        wheelAccumulator.current = 0;
      }, 220);
      if (wheelGestureActive.current) return;
      const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 120 : 1;
      wheelAccumulator.current += event.deltaY * scale;
      if (Math.abs(wheelAccumulator.current) < 32) return;
      const direction = wheelAccumulator.current > 0 ? 1 : -1;
      wheelAccumulator.current = 0;
      wheelGestureActive.current = true;
      cycleSubIndustry(direction);
    };
    bridge.addEventListener("wheel", handleWheel, { passive: false });
    return () => bridge.removeEventListener("wheel", handleWheel);
  }, [cycleSubIndustry]);

  useEffect(() => () => {
    if (wheelGestureTimer.current !== null) window.clearTimeout(wheelGestureTimer.current);
    if (bridgeMotionFrame.current !== null) window.cancelAnimationFrame(bridgeMotionFrame.current);
    if (bridgeMotionTimer.current !== null) window.clearTimeout(bridgeMotionTimer.current);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(catalogCollapsedStorageKey, String(catalogCollapsed));
  }, [catalogCollapsed]);

  return (
    <section className="industry-leaders-panel" aria-labelledby="industry-leaders-catalog-title">
      <div className={`industry-catalog ${catalogCollapsed ? "is-collapsed" : ""}`}>
        <div className="industry-catalog-heading">
          <div>
            <span className="eyebrow">CROSS-MARKET INDUSTRY DIRECTORY</span>
            <h2 id="industry-leaders-catalog-title">标准子行业目录</h2>
            <small>{catalogCollapsed && activeEntry
              ? `${activeEntry.sectorLabel} · ${activeEntry.label} · ${activeEntry.stockCount} 只候选股`
              : universe
                ? `完整名录 ${universe.listedCount.total.toLocaleString("zh-CN")} 只 · 合格入池 ${universe.eligibleCount.total.toLocaleString("zh-CN")} 只 · ${payload?.catalog.length || 0} 个子行业`
              : "正在同步三地证券名录"}</small>
          </div>
          <div className="industry-catalog-actions">
            <label className="industry-catalog-search">
              <Search size={15} aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="搜索子行业或一级行业" aria-label="搜索子行业或一级行业" tabIndex={catalogCollapsed ? -1 : 0} />
            </label>
            <button
              type="button"
              className="industry-catalog-collapse"
              onClick={() => setCatalogCollapsed((current) => !current)}
              aria-controls="industry-catalog-content"
              aria-expanded={!catalogCollapsed}
              aria-label={catalogCollapsed ? "展开子行业选择" : "折叠子行业选择"}
              title={catalogCollapsed ? "展开子行业选择" : "折叠子行业选择"}
            >
              {catalogCollapsed ? <PanelTopOpen size={16} /> : <PanelTopClose size={16} />}
            </button>
          </div>
        </div>
        <div id="industry-catalog-content" className="industry-catalog-content" aria-hidden={catalogCollapsed || undefined}>
          <div className="industry-catalog-content-inner">
            <div className="industry-taxonomy-note"><span>统一分类</span><strong>跨市场标准子行业</strong><small>TradingView 公共市场扫描</small></div>
            {universe ? <div className={`industry-universe-summary ${universe.stale || universe.fallback ? "has-warning" : ""}`}>
              {(["cn", "hk", "us"] as const).map((market) => <div key={market}>
                <span>{market === "cn" ? "A 股" : market === "hk" ? "港股" : "美股"}</span>
                <strong>{universe.eligibleCount[market].toLocaleString("zh-CN")}</strong>
                <small>/ {universe.listedCount[market].toLocaleString("zh-CN")} 名录</small>
              </div>)}
              <p>{universe.fallback ? "当前使用基础池" : universe.stale ? "刷新失败，沿用上一快照" : "名录运行正常"}</p>
            </div> : null}
            <div className="industry-category-filter" role="tablist" aria-label="一级行业筛选">
              {sectors.map((value) => (
                <button type="button" role="tab" tabIndex={catalogCollapsed ? -1 : 0} aria-selected={sector === value} className={sector === value ? "is-active" : ""} onClick={() => setSector(value)} key={value}>{value}</button>
              ))}
            </div>
            <div className="industry-catalog-list" aria-label="子行业选择">
              {matchingCatalog.map((entry) => (
                <button
                  type="button"
                  tabIndex={catalogCollapsed ? -1 : 0}
                  className={entry.id === activeSubIndustry ? "is-active" : ""}
                  aria-pressed={entry.id === activeSubIndustry}
                  onClick={() => selectSubIndustry(entry)}
                  title={`${entry.sectorLabel} · ${entry.taxonomy} · ${entry.eventCount} 个近期事件 · ${entry.stockCount} 只候选股`}
                  key={entry.id}
                >
                  <span>{entry.label}</span>
                  {entry.eventCount > 0 ? <b>{entry.eventCount}</b> : null}
                </button>
              ))}
              {!matchingCatalog.length ? <span className="industry-catalog-empty">没有匹配的子行业</span> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="industry-leader-status" aria-live="polite">
        <div>
          <TrendingUp size={16} />
          <strong>{payload?.selectedSubIndustryLabel || "子行业对照"}</strong>
          {activeEntry ? <span>{activeEntry.sectorLabel} · {activeEntry.stockCount} 只候选股 · {activeEntry.marketCount} 个市场 · {activeEntry.eventCount} 个近期事件</span> : null}
        </div>
        <span>{loading ? <><LoaderCircle className="is-spinning" size={14} />正在更新公开行情</> : universe ? `名录更新于 ${formatClock(universe.refreshedAt)}` : "等待数据"}</span>
      </div>
      {error ? <div className="industry-leader-error"><CircleAlert size={16} />{error}</div> : null}

      <div className={`industry-leader-comparison ${loading && !payload ? "is-loading" : ""} ${loading && payload ? "is-changing" : ""}`}>
        <section className="industry-market-pane is-china" aria-label="中国市场行业领航股" key={`china-${payload?.selectedSubIndustry || "loading"}`}>
          <header><div><i /><strong>中国市场</strong></div><span>A 股 · 港股</span></header>
          <div className="industry-china-groups">
            <section>
              <h3><span>A 股</span><small>沪深北</small></h3>
              <LeaderList stocks={payload?.leaders.cn || []} empty="暂无 A 股候选" loading={loading && !payload} />
            </section>
            <section>
              <h3><span>港股</span><small>香港市场</small></h3>
              <LeaderList stocks={payload?.leaders.hk || []} empty="暂无港股候选" loading={loading && !payload} />
            </section>
          </div>
        </section>

        <div
          ref={bridgeRef}
          className={`industry-market-bridge ${bridgeMotion ? `is-switching-${bridgeMotion}` : ""}`}
          data-wheel-control="true"
          role="spinbutton"
          tabIndex={0}
          aria-label="跨市场统一子行业"
          aria-valuemin={1}
          aria-valuemax={Math.max(1, wheelCatalog.length)}
          aria-valuenow={Math.max(1, activeWheelIndex + 1)}
          aria-valuetext={activeEntry?.label || payload?.selectedSubIndustryLabel || "等待数据"}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            cycleSubIndustry(event.key === "ArrowDown" ? 1 : -1);
          }}
          onPointerLeave={() => {
            wheelAccumulator.current = 0;
            wheelGestureActive.current = false;
            if (wheelGestureTimer.current !== null) window.clearTimeout(wheelGestureTimer.current);
          }}
        >
          <span className="industry-bridge-sector">{activeEntry?.sectorLabel || "一级行业"}</span>
          <div className="industry-bridge-preview is-previous" title={previousEntry?.label} aria-hidden="true">
            <ChevronUp size={11} />
            <span>{previousEntry?.label || "--"}</span>
          </div>
          <strong>{activeEntry?.label || payload?.selectedSubIndustryLabel || "--"}</strong>
          <div className="industry-bridge-preview is-next" title={nextEntry?.label} aria-hidden="true">
            <ChevronDown size={11} />
            <span>{nextEntry?.label || "--"}</span>
          </div>
          <small>统一子行业<br />市值与流动性排序</small>
        </div>

        <section className="industry-market-pane is-us" aria-label="美国市场行业领航股" key={`us-${payload?.selectedSubIndustry || "loading"}`}>
          <header><div><i /><strong>美国市场</strong></div><span>NASDAQ · NYSE</span></header>
          <LeaderList stocks={payload?.leaders.us || []} empty="暂无美股候选" loading={loading && !payload} />
        </section>
      </div>

      <footer className="industry-leader-source">
        <span>{universe
          ? `入池口径：主上市活跃普通股；市值 A/H ${compactUsd(universe.criteria.minMarketCapUsd.cn)}、美股 ${compactUsd(universe.criteria.minMarketCapUsd.us)} 起；30 日平均成交额 A/H ${compactUsd(universe.criteria.minTradedValueUsd.cn)}、美股 ${compactUsd(universe.criteria.minTradedValueUsd.us)} 起`
          : "入池口径：上市状态、主上市普通股、市值、30 日平均成交额和标准行业齐备"}</span>
        <span title={universe ? `${formatFull(universe.refreshedAt)} · 公司级产品来自公开资料并经景行规范化，缺失时使用标准子行业` : undefined}>数据源 {payload?.provider || "TradingView 公共市场扫描"} · 主要产品缺失时使用标准子行业</span>
      </footer>
    </section>
  );
}
