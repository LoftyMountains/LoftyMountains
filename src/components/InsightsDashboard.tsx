import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, ScanSearch, Share2 } from "lucide-react";
import type { AnalysisPayload, AnalysisWord } from "../../shared/types";
import { formatFull } from "../lib/time";
import { RelatedNewsDialog, type RelatedNewsSelection } from "./RelatedNewsDialog";
import { StockNetwork } from "./StockNetwork";
import { WordCloud } from "./WordCloud";
import { apiUrl } from "../lib/api";

export function InsightsDashboard() {
  const [payload, setPayload] = useState<AnalysisPayload | null>(null);
  const [selectedHours, setSelectedHours] = useState(24);
  const [selectedWord, setSelectedWord] = useState<AnalysisWord | null>(null);
  const [relatedSelection, setRelatedSelection] = useState<RelatedNewsSelection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl("/api/analysis")}?windows=1,24,168,720`);
      if (!response.ok) throw new Error("分析数据加载失败");
      setPayload(await response.json() as AnalysisPayload);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "分析数据加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const active = useMemo(() => payload?.windows.find((window) => window.hours === selectedHours) || payload?.windows[0], [payload, selectedHours]);

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
          {payload ? <span>更新于 {formatFull(payload.generatedAt)}</span> : null}
          <button className={`icon-button ${loading ? "is-spinning" : ""}`} onClick={() => void load()} title="刷新分析" aria-label="刷新分析"><RefreshCw size={17} /></button>
        </div>
      </header>

      <div className="analysis-windows" role="tablist" aria-label="统计时间窗口">
        {(payload?.windows || []).map((window) => (
          <button
            type="button"
            role="tab"
            aria-selected={selectedHours === window.hours}
            className={selectedHours === window.hours ? "is-active" : ""}
            key={window.hours}
            onClick={() => setSelectedHours(window.hours)}
          >
            <span>{window.label}</span>
            <strong>{window.eventCount}</strong>
            <small>{window.complete ? window.words[0]?.text || "暂无热点" : `覆盖 ${Math.round(window.coverageRatio * 100)}% · ${window.words[0]?.text || "数据积累中"}`}</small>
          </button>
        ))}
        {!payload && loading ? Array.from({ length: 4 }, (_, index) => <div className="window-skeleton" key={index} />) : null}
      </div>

      {error ? <div className="analysis-error">{error}</div> : null}
      <div className="analysis-plots">
        <section className="analysis-panel word-panel" aria-labelledby="word-cloud-title">
          <header>
            <div><ScanSearch size={17} /><h2 id="word-cloud-title">热点主题云</h2></div>
            {active ? <span>{active.eventCount} 个事件 · {active.sourceCount} 个来源</span> : null}
          </header>
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
