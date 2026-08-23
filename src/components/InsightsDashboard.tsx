import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, PanelRightOpen, RefreshCw, ScanSearch, Share2 } from "lucide-react";
import { createPortal } from "react-dom";
import type { AnalysisLink, AnalysisNode, AnalysisPayload, AnalysisRelationshipType, AnalysisWindow, AnalysisWord } from "../../shared/types";
import { apiUrl } from "../lib/api";
import { confidenceRank, relationshipLabels } from "../lib/relationships";
import { analysisNodeLabel } from "../lib/stocks";
import { formatClock, formatFull } from "../lib/time";
import { prefetchRelatedNews, RelatedNewsPanel, type RelatedNewsSelection, type SelectedRelationshipEvidence } from "./RelatedNewsDialog";
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
  const [wordCloudCollapsed, setWordCloudCollapsed] = useState(false);
  const [rightPanelsCollapsed, setRightPanelsCollapsed] = useState(false);
  const [rightPanelsPeeking, setRightPanelsPeeking] = useState(false);
  const [touchbarHost, setTouchbarHost] = useState<HTMLElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<CachedAnalysis | null>(cache);
  const loadingAnalysis = useRef(false);
  const autoPeekCloseTimer = useRef<number | null>(null);

  useEffect(() => {
    cacheRef.current = cache;
  }, [cache]);

  useEffect(() => {
    setTouchbarHost(document.getElementById("insights-touchbar-slot"));
  }, []);

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

  const clearAutoPeek = useCallback(() => {
    if (autoPeekCloseTimer.current !== null) window.clearTimeout(autoPeekCloseTimer.current);
    autoPeekCloseTimer.current = null;
    setRightPanelsPeeking(false);
  }, []);

  const clearSelection = useCallback(() => {
    clearAutoPeek();
    setSelectedWord(null);
    setSelectedStock(null);
    setRelatedSelection(null);
  }, [clearAutoPeek]);

  useEffect(() => () => {
    if (autoPeekCloseTimer.current !== null) window.clearTimeout(autoPeekCloseTimer.current);
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

  const setPanelCollapsed = useCallback((setter: (collapsed: boolean) => void, collapsed: boolean, focusId: string) => {
    setter(collapsed);
    window.requestAnimationFrame(() => {
      const target = document.getElementById(focusId);
      target?.focus({ preventScroll: true });
      const canvas = target?.closest<HTMLElement>(".insights-canvas");
      if (canvas) canvas.scrollLeft = 0;
    });
  }, []);

  const beginPanelPreview = useCallback(() => {
    if (autoPeekCloseTimer.current !== null) window.clearTimeout(autoPeekCloseTimer.current);
    autoPeekCloseTimer.current = null;
    setRightPanelsPeeking(true);
  }, []);

  const relationshipsForNode = useCallback((nodeId: string): SelectedRelationshipEvidence[] => filteredLinks
    .filter((link) => link.source === nodeId || link.target === nodeId)
    .map((link) => {
      const counterpartId = link.source === nodeId ? link.target : link.source;
      return { link, counterpartLabel: nodeLabels.get(counterpartId) || counterpartId.replace(/^[^:]+:/, "") };
    }), [filteredLinks, nodeLabels]);

  const topicSelection = useCallback((value: string, example?: string): RelatedNewsSelection => {
    const relationships = relationshipsForNode(`topic:${value}`);
    const previews: NonNullable<RelatedNewsSelection["previews"]> = relationships.flatMap(({ link }) => (link.evidence || []).map((evidence) => ({
      id: evidence.eventId,
      title: evidence.title,
      publishedAt: evidence.publishedAt,
      sources: evidence.sources,
    })));
    if (example && !previews.some((preview) => preview.title === example)) {
      previews.push({ id: `sample:${value}`, title: example });
    }
    return { type: "topic", value, label: value, relationships, previews };
  }, [relationshipsForNode]);

  const previewWord = useCallback((word: AnalysisWord) => {
    beginPanelPreview();
    setSelectedWord(word);
    setSelectedStock(null);
    setRelatedSelection(topicSelection(word.text, word.example));
  }, [beginPanelPreview, topicSelection]);

  const stockSelection = useCallback((node: AnalysisNode): RelatedNewsSelection => {
    const relationships = relationshipsForNode(node.id);
    return { type: "stock", value: node.symbol || node.label, label: analysisNodeLabel(node), relationships };
  }, [relationshipsForNode]);

  const previewNetworkNode = useCallback((node: AnalysisNode) => {
    beginPanelPreview();
    if (node.type === "topic") {
      const word = active?.words.find((candidate) => candidate.text === node.label) || null;
      setSelectedWord(word);
      setSelectedStock(null);
      setRelatedSelection(topicSelection(node.label, word?.example));
      return;
    }
    setSelectedWord(null);
    setSelectedStock(node);
    setRelatedSelection(stockSelection(node));
  }, [active?.words, beginPanelPreview, stockSelection, topicSelection]);

  useEffect(() => {
    if (!active?.from || !active.to || !active.words.length) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;
    let cancelled = false;
    const prefetch = async () => {
      for (const word of active.words.slice(0, 4)) {
        if (cancelled) return;
        try {
          await prefetchRelatedNews(active.from, active.to, "topic", word.text);
        } catch {
          // User-triggered loading still reports failures in the panel.
        }
      }
    };
    const timer = window.setTimeout(() => void prefetch(), 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active]);

  const endPanelPreview = useCallback(() => {
    if (autoPeekCloseTimer.current !== null) window.clearTimeout(autoPeekCloseTimer.current);
    autoPeekCloseTimer.current = window.setTimeout(() => {
      setRightPanelsPeeking(false);
      autoPeekCloseTimer.current = null;
    }, 140);
  }, []);

  return (
    <>
      {touchbarHost ? createPortal(
        <div className={`insights-touchbar density-${densityMode}`} aria-label="热点与股票关联控制">
          <div className="touchbar-title"><Share2 size={14} /><span>关联控制</span></div>
          <div className="touchbar-periods" role="tablist" aria-label="统计时间窗口">
            <span>周期</span>
            <div>
              {analysisWindows.map((option) => {
                const summary = summariesByHours.get(option.hours);
                const shortLabel = option.hours === 1 ? "1H" : option.hours === 24 ? "1D" : option.hours === 168 ? "1W" : "1M";
                const detail = summary
                  ? `${option.label} · ${summary.eventCount} 个事件 · ${coverageLabel(summary.coverageRatio, summary.complete)}`
                  : `${option.label} · 数据加载中`;
                return (
                  <button
                    type="button"
                    role="tab"
                    key={option.hours}
                    className={selectedHours === option.hours ? "is-active" : ""}
                    aria-selected={selectedHours === option.hours}
                    aria-label={detail}
                    title={detail}
                    onClick={() => setSelectedHours(option.hours)}
                  >
                    {shortLabel}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="touchbar-control is-relationship">
            <span>关系</span>
            <select value={relationshipType} onChange={(event) => setRelationshipType(event.target.value as RelationshipTypeFilter)} aria-label="关系类型">
              <option value="all">全部关系</option>
              {relationshipTypes.map((type) => <option value={type} key={type}>{relationshipLabels[type]}</option>)}
            </select>
            <ChevronDown aria-hidden="true" />
          </label>
          <label className="touchbar-control is-confidence">
            <span>置信度</span>
            <select value={minimumConfidence} onChange={(event) => setMinimumConfidence(event.target.value as ConfidenceFilter)} aria-label="最低置信度">
              <option value="low">全部</option>
              <option value="medium">中及以上</option>
              <option value="high">仅高置信</option>
            </select>
            <ChevronDown aria-hidden="true" />
          </label>
          <label className="touchbar-control is-events">
            <span>共同事件</span>
            <select value={minimumEvents} onChange={(event) => setMinimumEvents(Number(event.target.value))} aria-label="最少共同事件">
              {[1, 2, 3, 5].map((count) => <option value={count} key={count}>{count} 个</option>)}
            </select>
            <ChevronDown aria-hidden="true" />
          </label>
          <div className="touchbar-density" role="group" aria-label="信息密度">
            <span>密度</span>
            <div>
              {(["overview", "analysis", "research"] as const).map((mode) => (
                <button
                  type="button"
                  key={mode}
                  className={densityMode === mode ? "is-active" : ""}
                  aria-pressed={densityMode === mode}
                  aria-label={`${mode === "overview" ? "概览" : mode === "analysis" ? "分析" : "研究"}密度`}
                  title={`${mode === "overview" ? "概览" : mode === "analysis" ? "分析" : "研究"}密度`}
                  onClick={() => setDensityMode(mode)}
                >
                  {mode === "overview" ? "概" : mode === "analysis" ? "析" : "研"}
                </button>
              ))}
            </div>
          </div>
          <output className="touchbar-result" title={`显示 ${filteredLinks.length} 条，共 ${graphLinks.length} 条关系`}>
            <i />{filteredLinks.length}/{graphLinks.length}
          </output>
        </div>,
        touchbarHost,
      ) : null}
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

      {error ? <div className="analysis-error">{error}</div> : null}
      <div className="insights-workbench">
        {coverageDetail ? <div className="analysis-coverage-detail">{coverageDetail}</div> : null}

        <div className={`insights-canvas ${selectedStock ? "has-stock-selection" : ""} ${wordCloudCollapsed ? "is-word-cloud-collapsed" : ""} ${rightPanelsCollapsed ? "is-related-news-collapsed" : ""} ${selectedStock && rightPanelsCollapsed ? "is-daily-chart-collapsed" : ""}`}>
          <StockNetwork
            nodes={filteredNodes}
            links={filteredLinks}
            emptyMessage={graphEmptyMessage}
            highlightedNodeId={highlightedNodeId}
            onClearSelection={clearSelection}
            onPreview={previewNetworkNode}
            onTogglePreview={previewNetworkNode}
            onPreviewEnd={endPanelPreview}
          />

          <section id="word-cloud-panel" className={`insight-overlay word-cloud-panel ${wordCloudCollapsed ? "is-collapsed" : ""}`} aria-labelledby="word-cloud-title" aria-hidden={wordCloudCollapsed || undefined}>
            <header>
              <div className="insight-panel-title"><ScanSearch size={15} /><div><span>热点扫描</span><h2 id="word-cloud-title">主题词云</h2></div></div>
              <div className="insight-panel-actions">
                <strong>{active ? `${active.eventCount} 个事件` : "--"}</strong>
                <button id="word-cloud-collapse" type="button" className="insight-panel-collapse" onClick={() => setPanelCollapsed(setWordCloudCollapsed, true, "word-cloud-expand")} aria-controls="word-cloud-panel" aria-expanded="true" title="折叠主题词云" aria-label="折叠主题词云"><PanelLeftClose size={15} /></button>
              </div>
            </header>
            <HotspotRadar
              words={active?.words || []}
              connectedTopics={connectedTopics}
              selected={selectedWord?.text || null}
              onPreview={(word) => previewWord(word)}
              onTogglePreview={(word) => previewWord(word)}
              onPreviewEnd={endPanelPreview}
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

          <RelatedNewsPanel
            selection={relatedSelection}
            from={active?.from || null}
            to={active?.to || null}
            collapsed={rightPanelsCollapsed && !rightPanelsPeeking}
            peeking={rightPanelsCollapsed && rightPanelsPeeking}
            onCollapse={() => {
              clearAutoPeek();
              setPanelCollapsed(setRightPanelsCollapsed, true, "related-news-expand");
            }}
          />
          {selectedStock ? (
            <StockDailyChart
              node={selectedStock}
              collapsed={rightPanelsCollapsed && !rightPanelsPeeking}
              peeking={rightPanelsCollapsed && rightPanelsPeeking}
              onCollapse={() => {
                clearAutoPeek();
                setPanelCollapsed(setRightPanelsCollapsed, true, "daily-chart-expand");
              }}
            />
          ) : null}

          <button
            type="button"
            id="word-cloud-expand"
            className={`insight-edge-trigger is-left is-word-cloud ${wordCloudCollapsed ? "is-visible" : ""}`}
            onClick={() => setPanelCollapsed(setWordCloudCollapsed, false, "word-cloud-collapse")}
            aria-controls="word-cloud-panel"
            aria-expanded={!wordCloudCollapsed}
            aria-label="展开主题词云"
            title="展开主题词云"
            tabIndex={wordCloudCollapsed ? 0 : -1}
          >
            <PanelLeftOpen size={16} />
            <span>词云</span>
          </button>
          <button
            type="button"
            id="related-news-expand"
            className={`insight-edge-trigger is-right is-related-news ${rightPanelsCollapsed && !rightPanelsPeeking ? "is-visible" : ""}`}
            onClick={() => {
              clearAutoPeek();
              setPanelCollapsed(setRightPanelsCollapsed, false, "related-news-collapse");
            }}
            aria-controls="related-news-shell"
            aria-expanded={!rightPanelsCollapsed || rightPanelsPeeking}
            aria-label="展开相关新闻"
            title="展开相关新闻"
            tabIndex={rightPanelsCollapsed && !rightPanelsPeeking ? 0 : -1}
          >
            <PanelRightOpen size={16} />
            <span>快讯</span>
          </button>
          {selectedStock ? (
            <button
              type="button"
              id="daily-chart-expand"
              className={`insight-edge-trigger is-right is-daily-chart ${rightPanelsCollapsed && !rightPanelsPeeking ? "is-visible" : ""}`}
              onClick={() => {
                clearAutoPeek();
                setPanelCollapsed(setRightPanelsCollapsed, false, "daily-chart-collapse");
              }}
              aria-controls="stock-daily-shell"
              aria-expanded={!rightPanelsCollapsed || rightPanelsPeeking}
              aria-label="展开日 K 线图"
              title="展开日 K 线图"
              tabIndex={rightPanelsCollapsed && !rightPanelsPeeking ? 0 : -1}
            >
              <PanelRightOpen size={16} />
              <span>日 K</span>
            </button>
          ) : null}

          <div className="canvas-network-meta">
            <div className="network-edge-legend" aria-label="关系类型图例">
              {relationshipTypes.map((type) => <span key={type}><i className={`is-${type}`} />{relationshipLabels[type]}</span>)}
            </div>
          </div>
        </div>
      </div>
      </section>
    </>
  );
}
