import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, ScanSearch, Share2 } from "lucide-react";
import type { AnalysisLink, AnalysisNode, AnalysisPayload, AnalysisRelationshipType, AnalysisWindow, AnalysisWord } from "../../shared/types";
import { apiUrl } from "../lib/api";
import { confidenceRank, relationshipLabels } from "../lib/relationships";
import { analysisNodeLabel } from "../lib/stocks";
import { formatClock, formatFull } from "../lib/time";
import { RelatedNewsPanel, type RelatedNewsSelection } from "./RelatedNewsDialog";
import { StockDailyChart } from "./StockDailyChart";
import { StockNetwork } from "./StockNetwork";
import { HotspotRadar } from "./HotspotRadar";

const analysisWindows = [
  { hours: 1, label: "近 1 小时" },
  { hours: 24, label: "近 1 天" },
  { hours: 168, label: "近 1 周" },
  { hours: 720, label: "近 1 月" },
] as const;

const analysisWindowsQuery = analysisWindows.map(({ hours }) => hours).join(",");
const windowCacheMs = 2 * 60_000;

interface CachedAnalysis {
  payload: AnalysisPayload;
  etag: string | null;
  fetchedAt: number;
}

const relationshipTypes = [
  "news-cooccurrence",
  "stock-cooccurrence",
  "company-industry",
  "policy-impact",
  "supply-chain",
] as const;

type RelationshipTypeFilter = AnalysisRelationshipType | "all";
type ConfidenceFilter = AnalysisLink["confidence"];
type DensityMode = "overview" | "analysis" | "research";

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

export function InsightsDashboard({ revision, compact = false }: { revision: string | null; compact?: boolean }) {
  const [cache, setCache] = useState<CachedAnalysis | null>(null);
  const [selectedHours, setSelectedHours] = useState(24);
  const [selectedWord, setSelectedWord] = useState<AnalysisWord | null>(null);
  const [selectedStock, setSelectedStock] = useState<AnalysisNode | null>(null);
  const [relatedSelection, setRelatedSelection] = useState<RelatedNewsSelection | null>(null);
  const [relationshipType, setRelationshipType] = useState<RelationshipTypeFilter>("all");
  const [minimumConfidence, setMinimumConfidence] = useState<ConfidenceFilter>("medium");
  const [minimumEvents, setMinimumEvents] = useState(3);
  const [densityMode, setDensityMode] = useState<DensityMode>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<CachedAnalysis | null>(cache);
  const loadingAnalysis = useRef(false);

  useEffect(() => {
    cacheRef.current = cache;
  }, [cache]);

  const load = useCallback(async (revalidate = false) => {
    const cached = cacheRef.current;
    if (!revalidate && cached && Date.now() - cached.fetchedAt < windowCacheMs) return;
    if (loadingAnalysis.current) return;
    loadingAnalysis.current = true;
    setLoading(true);
    try {
      const headers = new Headers();
      if (cached?.etag) headers.set("If-None-Match", cached.etag);
      const response = await fetch(`${apiUrl("/api/analysis")}?windows=${analysisWindowsQuery}`, { headers });
      if (response.status === 304 && cached) {
        const refreshed = { ...cached, fetchedAt: Date.now() };
        cacheRef.current = refreshed;
        setCache(refreshed);
        setError(null);
        return;
      }
      if (!response.ok) throw new Error("分析数据加载失败");
      const payload = await response.json() as AnalysisPayload;
      const next = { payload, etag: response.headers.get("ETag"), fetchedAt: Date.now() };
      cacheRef.current = next;
      setCache(next);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "分析数据加载失败");
    } finally {
      loadingAnalysis.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (revision) void load(true);
  }, [load, revision]);

  useEffect(() => {
    const revalidateVisibleWindow = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    document.addEventListener("visibilitychange", revalidateVisibleWindow);
    window.addEventListener("pageshow", revalidateVisibleWindow);
    return () => {
      document.removeEventListener("visibilitychange", revalidateVisibleWindow);
      window.removeEventListener("pageshow", revalidateVisibleWindow);
    };
  }, [load]);

  const payload = cache?.payload || null;
  const active = useMemo(() => payload?.windows.find((window) => window.hours === selectedHours), [payload, selectedHours]);
  const summariesByHours = useMemo(() => new Map(payload?.summaries
    .map((summary) => [summary.hours, summary] as const) || []), [payload]);
  const activeSummary = summariesByHours.get(selectedHours) || null;
  const dataThrough = active?.actualTo || activeSummary?.actualTo || payload?.latestEventAt || null;
  const coverageDetail = coverageDetailFor(active || null);
  const graphLinks = useMemo(() => (active?.links || []).map((link) => ({
    ...link,
    evidence: Array.isArray(link.evidence) ? link.evidence : [],
  })), [active]);
  const filteredLinks = useMemo(() => graphLinks.filter((link) => (
    (relationshipType === "all" || link.type === relationshipType)
    && confidenceRank[link.confidence] >= confidenceRank[minimumConfidence]
    && link.cooccurrenceCount >= minimumEvents
  )), [graphLinks, minimumConfidence, minimumEvents, relationshipType]);
  const filteredNodes = useMemo(() => {
    const linkedNodeIds = new Set(filteredLinks.flatMap((link) => [link.source, link.target]));
    return (active?.nodes || []).filter((node) => linkedNodeIds.has(node.id));
  }, [active, filteredLinks]);
  const nodeLabels = useMemo(() => new Map((active?.nodes || []).map((node) => [node.id, analysisNodeLabel(node)])), [active]);
  const graphEmptyMessage = !active && loading
    ? "正在加载关系证据"
    : graphLinks.length
      ? "没有符合当前筛选条件的关系"
      : "当前窗口关系证据不足";

  const highlightedNodeId = selectedStock?.id || (selectedWord ? `topic:${selectedWord.text}` : null);
  const connectedTopics = useMemo(() => filteredNodes
    .filter((node) => node.type === "topic")
    .map((node) => node.label), [filteredNodes]);

  const clearSelection = useCallback(() => {
    setSelectedWord(null);
    setSelectedStock(null);
    setRelatedSelection(null);
  }, []);

  useEffect(clearSelection, [clearSelection, selectedHours]);
  useEffect(clearSelection, [clearSelection, minimumConfidence, minimumEvents, relationshipType]);

  useEffect(() => {
    if (densityMode === "overview") {
      setMinimumConfidence("medium");
      setMinimumEvents(3);
    } else if (densityMode === "analysis") {
      setMinimumConfidence("low");
      setMinimumEvents(2);
    } else {
      setMinimumConfidence("low");
      setMinimumEvents(1);
    }
  }, [densityMode]);

  const previewWord = useCallback((word: AnalysisWord) => {
    setSelectedWord(word);
    setSelectedStock(null);
    setRelatedSelection({ type: "topic", value: word.text, label: word.text });
  }, []);

  const stockSelection = useCallback((node: AnalysisNode): RelatedNewsSelection => {
    const relationships = filteredLinks
      .filter((link) => link.source === node.id || link.target === node.id)
      .map((link) => {
        const counterpartId = link.source === node.id ? link.target : link.source;
        return { link, counterpartLabel: nodeLabels.get(counterpartId) || counterpartId.replace(/^[^:]+:/, "") };
      });
    return { type: "stock", value: node.symbol || node.label, label: analysisNodeLabel(node), relationships };
  }, [filteredLinks, nodeLabels]);

  const previewStock = useCallback((node: AnalysisNode) => {
    setSelectedWord(null);
    setSelectedStock(node);
    setRelatedSelection(stockSelection(node));
  }, [stockSelection]);

  const preserveSelection = useCallback(() => undefined, []);

  return (
    <section id="market-insights" className={`insights-dashboard ${compact ? "is-compact" : ""}`} aria-labelledby="market-insights-title">
      <header className="insights-heading">
        <div>
          <span className="eyebrow">MARKET INTELLIGENCE</span>
          <h1 id="market-insights-title">热点与股票关联</h1>
        </div>
        <div className="insights-heading-meta">
          <div className="insights-times">
            {payload ? <span title={formatFull(payload.generatedAt)}>分析更新于 {formatClock(payload.generatedAt)}</span> : null}
            {dataThrough ? <span title={formatFull(dataThrough)}>数据截至 {formatClock(dataThrough)}</span> : <span>数据截至 --</span>}
          </div>
          <button className={`icon-button ${loading ? "is-spinning" : ""}`} onClick={() => void load(true)} title="刷新分析" aria-label="刷新分析"><RefreshCw size={17} /></button>
        </div>
      </header>

      <div className={`analysis-windows is-window-${analysisWindows.findIndex((option) => option.hours === selectedHours)}`} role="tablist" aria-label="统计时间窗口">
        {analysisWindows.map((option) => {
          const summary = summariesByHours.get(option.hours);
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
      <div className="insights-workbench">
        <header className={`insights-toolbar density-${densityMode}`}>
          <div className="insights-toolbar-title"><Share2 size={16} /><div><span>关系底图</span><h2>市场关联全景</h2></div></div>
          <div className="relationship-filters" aria-label="关联关系筛选">
            <label>
              <span>关系类型</span>
              <select value={relationshipType} onChange={(event) => setRelationshipType(event.target.value as RelationshipTypeFilter)}>
                <option value="all">全部关系</option>
                {relationshipTypes.map((type) => <option value={type} key={type}>{relationshipLabels[type]}</option>)}
              </select>
            </label>
            <label>
              <span>最低置信度</span>
              <select value={minimumConfidence} onChange={(event) => setMinimumConfidence(event.target.value as ConfidenceFilter)}>
                <option value="low">全部</option>
                <option value="medium">中及以上</option>
                <option value="high">仅高置信</option>
              </select>
            </label>
            <label>
              <span>最少共同事件</span>
              <select value={minimumEvents} onChange={(event) => setMinimumEvents(Number(event.target.value))}>
                {[1, 2, 3, 5].map((count) => <option value={count} key={count}>{count} 个</option>)}
              </select>
            </label>
            <output aria-live="polite">{filteredLinks.length} / {graphLinks.length} 条</output>
          </div>
          <div className="density-switcher" role="group" aria-label="信息密度">
            <span>密度</span>
            {(["overview", "analysis", "research"] as const).map((mode) => (
              <button
                type="button"
                key={mode}
                className={densityMode === mode ? "is-active" : ""}
                aria-pressed={densityMode === mode}
                onClick={() => setDensityMode(mode)}
              >
                {mode === "overview" ? "概览" : mode === "analysis" ? "分析" : "研究"}
              </button>
            ))}
          </div>
          <div className="network-legend" aria-label="股票周期涨跌颜色图例">
            <span><i className="is-stock price-up" />涨</span>
            <span><i className="is-stock price-down" />跌</span>
            <span><i className="is-stock price-unavailable" />无行情</span>
            <span><i className="is-topic" />主题</span>
          </div>
        </header>
        {coverageDetail ? <div className="analysis-coverage-detail">{coverageDetail}</div> : null}

        <div className={`insights-canvas ${selectedStock ? "has-stock-selection" : ""}`}>
          <StockNetwork
            nodes={filteredNodes}
            links={filteredLinks}
            emptyMessage={graphEmptyMessage}
            highlightedNodeId={highlightedNodeId}
            onClearSelection={clearSelection}
            onPreview={previewStock}
            onTogglePreview={previewStock}
            onPreviewEnd={preserveSelection}
          />

          <section className="insight-overlay word-cloud-panel" aria-labelledby="word-cloud-title">
            <header>
              <div className="insight-panel-title"><ScanSearch size={15} /><div><span>热点扫描</span><h2 id="word-cloud-title">主题词云</h2></div></div>
              <strong>{active ? `${active.eventCount} 个事件` : "--"}</strong>
            </header>
            <HotspotRadar
              words={active?.words || []}
              connectedTopics={connectedTopics}
              selected={selectedWord?.text || null}
              onPreview={(word) => previewWord(word)}
              onTogglePreview={(word) => previewWord(word)}
              onPreviewEnd={preserveSelection}
            />
            <footer>
              {selectedWord ? (
                <>
                  <strong>{selectedWord.text}</strong>
                  <span>{selectedWord.count} 个事件</span>
                  <span>突发 {selectedWord.burst >= 0 ? "+" : ""}{selectedWord.burst.toFixed(2)}</span>
                  <span>来源 {Math.round(selectedWord.sourceDiversity * 100)}%</span>
                </>
              ) : (
                <>
                  <span>{active ? `${active.words.length} 个高价值主题` : "暂无统计"}</span>
                  <span className="direction-legend" aria-label="词云方向颜色图例">
                    <i className="direction-positive" />正面
                    <i className="direction-negative" />负面
                    <i className="direction-mixed" />混合
                    <i className="direction-neutral" />中性
                  </span>
                </>
              )}
            </footer>
          </section>

          <RelatedNewsPanel selection={relatedSelection} from={active?.from || null} to={active?.to || null} />
          {selectedStock ? <StockDailyChart node={selectedStock} /> : null}

          <div className="canvas-network-meta">
            <div className="network-edge-legend" aria-label="关系类型图例">
              {relationshipTypes.map((type) => <span key={type}><i className={`is-${type}`} />{relationshipLabels[type]}</span>)}
            </div>
            <div className="canvas-network-counts">
              <span>股票 {filteredNodes.filter((node) => node.type === "stock").length}</span>
              <span>主题 {filteredNodes.filter((node) => node.type === "topic").length}</span>
              <span>高置信 {filteredLinks.filter((link) => link.confidence === "high").length}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
