import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, ScanSearch, Share2 } from "lucide-react";
import type { AnalysisPayload, AnalysisWindow, AnalysisWord } from "../../shared/types";
import { formatClock, formatFull } from "../lib/time";
import { RelatedNewsDialog, type RelatedNewsSelection } from "./RelatedNewsDialog";
import { StockNetwork } from "./StockNetwork";
import { WordCloud } from "./WordCloud";
import { apiUrl } from "../lib/api";

const analysisWindows = [
  { hours: 1, label: "近 1 小时" },
  { hours: 24, label: "近 1 天" },
  { hours: 168, label: "近 1 周" },
  { hours: 720, label: "近 1 月" },
] as const;

const windowCacheMs = 2 * 60_000;

interface CachedAnalysis {
  payload: AnalysisPayload;
  etag: string | null;
  fetchedAt: number;
}

const relationshipLegend = [
  ["news-cooccurrence", "新闻共现"],
  ["stock-cooccurrence", "股票共现"],
  ["company-industry", "公司行业"],
  ["policy-impact", "政策影响"],
  ["supply-chain", "供应链事件"],
] as const;

function coverageLabel(coverageRatio: number | null, complete: boolean | null) {
  if (coverageRatio === null || complete === null) return "覆盖率未知";
  return `${Math.round(coverageRatio * 100)}% / ${complete ? "完整" : "积累中"}`;
}

function coverageDetailFor(window: AnalysisWindow | null) {
  if (!window) return null;
  if (window.coverageRatio === null) return "覆盖记录尚未建立";
  if (window.complete) return null;
  return window.actualFrom && window.actualTo
    ? `实际覆盖 ${formatFull(window.actualFrom)} - ${formatFull(window.actualTo)}`
    : "当前没有可用覆盖记录";
}

export function InsightsDashboard({ revision }: { revision: string | null }) {
  const [cache, setCache] = useState<Record<number, CachedAnalysis>>({});
  const [selectedHours, setSelectedHours] = useState(24);
  const [selectedWord, setSelectedWord] = useState<AnalysisWord | null>(null);
  const [relatedSelection, setRelatedSelection] = useState<RelatedNewsSelection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const cacheRef = useRef(cache);
  const loadingWindows = useRef(new Set<number>());

  useEffect(() => {
    cacheRef.current = cache;
  }, [cache]);

  const load = useCallback(async (hours: number, revalidate = false) => {
    const cached = cacheRef.current[hours];
    if (!revalidate && cached && Date.now() - cached.fetchedAt < windowCacheMs) return;
    if (loadingWindows.current.has(hours)) return;
    loadingWindows.current.add(hours);
    setLoading(true);
    try {
      const headers = new Headers();
      if (cached?.etag) headers.set("If-None-Match", cached.etag);
      const response = await fetch(`${apiUrl("/api/analysis")}?windows=${hours}`, { headers });
      if (response.status === 304 && cached) {
        const refreshed = { ...cached, fetchedAt: Date.now() };
        cacheRef.current = { ...cacheRef.current, [hours]: refreshed };
        setCache(cacheRef.current);
        setError(null);
        return;
      }
      if (!response.ok) throw new Error("分析数据加载失败");
      const payload = await response.json() as AnalysisPayload;
      const next = {
        payload,
        etag: response.headers.get("ETag"),
        fetchedAt: Date.now(),
      };
      cacheRef.current = { ...cacheRef.current, [hours]: next };
      setCache(cacheRef.current);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "分析数据加载失败");
    } finally {
      loadingWindows.current.delete(hours);
      setLoading(loadingWindows.current.size > 0);
    }
  }, []);

  useEffect(() => {
    void load(selectedHours);
  }, [load, selectedHours]);

  useEffect(() => {
    if (revision) void load(selectedHours, true);
  }, [load, revision, selectedHours]);

  useEffect(() => {
    const revalidateVisibleWindow = () => {
      if (document.visibilityState === "visible") void load(selectedHours, true);
    };
    document.addEventListener("visibilitychange", revalidateVisibleWindow);
    window.addEventListener("pageshow", revalidateVisibleWindow);
    return () => {
      document.removeEventListener("visibilitychange", revalidateVisibleWindow);
      window.removeEventListener("pageshow", revalidateVisibleWindow);
    };
  }, [load, selectedHours]);

  const payload = cache[selectedHours]?.payload || null;
  const active = useMemo(() => payload?.windows[0], [payload]);
  const latestPayload = useMemo(() => Object.values(cache)
    .map((entry) => entry.payload)
    .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))[0] || null, [cache]);
  const activeSummary = latestPayload?.summaries.find((summary) => summary.hours === selectedHours) || null;
  const dataThrough = active?.actualTo || activeSummary?.actualTo || latestPayload?.latestEventAt || null;
  const coverageDetail = coverageDetailFor(active || null);

  useEffect(() => {
    if (openTimer.current !== null) window.clearTimeout(openTimer.current);
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
    setSelectedWord(null);
    setRelatedSelection(null);
  }, [selectedHours]);

  const cancelPreviewClose = useCallback(() => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const openRelatedPreview = useCallback((selection: RelatedNewsSelection) => {
    cancelPreviewClose();
    if (openTimer.current !== null) window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => {
      setRelatedSelection(selection);
      openTimer.current = null;
    }, 120);
  }, [cancelPreviewClose]);

  const closeRelatedPreview = useCallback(() => {
    if (openTimer.current !== null) window.clearTimeout(openTimer.current);
    openTimer.current = null;
    cancelPreviewClose();
    closeTimer.current = window.setTimeout(() => {
      setRelatedSelection(null);
      closeTimer.current = null;
    }, 220);
  }, [cancelPreviewClose]);

  const previewWord = useCallback((word: AnalysisWord, anchor: { x: number; y: number }) => {
    setSelectedWord(word);
    openRelatedPreview({ type: "topic", value: word.text, label: word.text, anchor });
  }, [openRelatedPreview]);

  const previewStock = useCallback((node: { label: string; symbol?: string }, anchor: { x: number; y: number }) => {
    openRelatedPreview({ type: "stock", value: node.symbol || node.label, label: node.label, anchor });
  }, [openRelatedPreview]);

  const closeRelatedNews = useCallback(() => {
    if (openTimer.current !== null) window.clearTimeout(openTimer.current);
    cancelPreviewClose();
    openTimer.current = null;
    setRelatedSelection(null);
  }, [cancelPreviewClose]);

  useEffect(() => () => {
    if (openTimer.current !== null) window.clearTimeout(openTimer.current);
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
  }, []);

  return (
    <section id="market-insights" className="insights-dashboard" aria-labelledby="market-insights-title">
      <header className="insights-heading">
        <div>
          <span className="eyebrow">MARKET INTELLIGENCE</span>
          <h1 id="market-insights-title">热点与股票关联</h1>
        </div>
        <div className="insights-heading-meta">
          <div className="insights-times">
            {latestPayload ? <span title={formatFull(latestPayload.generatedAt)}>分析更新于 {formatClock(latestPayload.generatedAt)}</span> : null}
            {dataThrough ? <span title={formatFull(dataThrough)}>数据截至 {formatClock(dataThrough)}</span> : <span>数据截至 --</span>}
          </div>
          <button className={`icon-button ${loading ? "is-spinning" : ""}`} onClick={() => void load(selectedHours, true)} title="刷新分析" aria-label="刷新分析"><RefreshCw size={17} /></button>
        </div>
      </header>

      <div className="analysis-windows" role="tablist" aria-label="统计时间窗口">
        {analysisWindows.map((option) => {
          const summary = latestPayload?.summaries.find((item) => item.hours === option.hours);
          return (
            <button
              type="button"
              role="tab"
              aria-selected={selectedHours === option.hours}
              className={selectedHours === option.hours ? "is-active" : ""}
              key={option.hours}
              onClick={() => setSelectedHours(option.hours)}
            >
              <span>{option.label}</span>
              <strong>{summary?.eventCount ?? "--"}</strong>
              <small>
                <b>{summary ? coverageLabel(summary.coverageRatio, summary.complete) : "覆盖率 --"}</b>
                <span>{summary?.topTopic || "暂无热点"}</span>
              </small>
            </button>
          );
        })}
      </div>

      {error ? <div className="analysis-error">{error}</div> : null}
      <div className="analysis-plots">
        <section className="analysis-panel word-panel" aria-labelledby="word-cloud-title">
          <header>
            <div><ScanSearch size={17} /><h2 id="word-cloud-title">热点主题云</h2></div>
            {active ? <span>{active.eventCount} 个事件 · {active.sourceCount} 个来源</span> : null}
          </header>
          {coverageDetail ? <div className="analysis-coverage-detail">{coverageDetail}</div> : null}
          <WordCloud
            words={active?.words || []}
            selected={selectedWord?.text || null}
            onPreview={previewWord}
            onPreviewEnd={closeRelatedPreview}
          />
          <footer>
            {selectedWord ? (
              <>
                <strong>{selectedWord.text}</strong>
                <span>{selectedWord.count} 个事件</span>
                <span>前窗 {selectedWord.baselineCount}</span>
                <span>突发 {selectedWord.burst >= 0 ? "+" : ""}{selectedWord.burst.toFixed(2)}</span>
                <span>来源多样性 {Math.round(selectedWord.sourceDiversity * 100)}%</span>
                <span>{selectedWord.direction === "positive" ? "偏正面" : selectedWord.direction === "negative" ? "偏负面" : selectedWord.direction === "mixed" ? "方向混合" : "方向中性"}</span>
                <span className="topic-example">{selectedWord.example}</span>
              </>
            ) : <span>{active ? `共 ${active.words.length} 个高频词` : "暂无统计"}</span>}
          </footer>
        </section>

        <section className="analysis-panel network-panel" aria-labelledby="stock-network-title">
          <header>
            <div><Share2 size={17} /><h2 id="stock-network-title">关联股票图</h2></div>
            <div className="network-legend"><span><i className="is-stock" />股票</span><span><i className="is-topic" />主题</span></div>
          </header>
          {coverageDetail ? <div className="analysis-coverage-detail">{coverageDetail}</div> : null}
          <div className="network-edge-legend" aria-label="关系类型图例">
            {relationshipLegend.map(([type, label]) => <span key={type}><i className={`is-${type}`} />{label}</span>)}
          </div>
          <StockNetwork
            nodes={active?.nodes || []}
            links={active?.links || []}
            onPreview={previewStock}
            onPreviewEnd={closeRelatedPreview}
          />
          <footer>
            <span>股票 {active?.nodes.filter((node) => node.type === "stock").length || 0}</span>
            <span>主题 {active?.nodes.filter((node) => node.type === "topic").length || 0}</span>
            <span>关联 {active?.links.length || 0}</span>
            <span>高置信 {active?.links.filter((link) => link.confidence === "high").length || 0}</span>
          </footer>
        </section>
      </div>
      {relatedSelection && active ? (
        <RelatedNewsDialog
          selection={relatedSelection}
          from={active.from}
          to={active.to}
          onClose={closeRelatedNews}
          onPointerEnter={cancelPreviewClose}
          onPointerLeave={closeRelatedPreview}
        />
      ) : null}
    </section>
  );
}
