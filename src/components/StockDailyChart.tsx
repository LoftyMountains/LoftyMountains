import { useEffect, useMemo, useRef, useState } from "react";
import { ChartNoAxesCombined, CircleAlert, LoaderCircle, PanelRightClose, RotateCcw } from "lucide-react";
import type { AnalysisDailyPoint, AnalysisDailySeries, AnalysisNode } from "../../shared/types";
import { apiUrl } from "../lib/api";
import { analysisNodeLabel } from "../lib/stocks";

const chartWidth = 420;
const chartHeight = 176;
const inset = { top: 30, right: 14, bottom: 25, left: 44 };

interface CandlePoint extends AnalysisDailyPoint {
  open: number;
  high: number;
  low: number;
}

function shortDate(date: string) {
  return `${date.slice(5, 7)}/${date.slice(8, 10)}`;
}

function validPrice(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasCandles(points: AnalysisDailyPoint[]) {
  return points.length >= 2 && points.every((point) => validPrice(point.open)
    && validPrice(point.high)
    && validPrice(point.low));
}

function normalizeCandles(points: AnalysisDailyPoint[]): CandlePoint[] {
  return points.flatMap((point) => {
    if (!validPrice(point.close)) return [];
    const open = validPrice(point.open) ? point.open : point.close;
    const high = Math.max(validPrice(point.high) ? point.high : point.close, open, point.close);
    const low = Math.min(validPrice(point.low) ? point.low : point.close, open, point.close);
    return [{ ...point, open, high, low }];
  });
}

function chartModel(points: CandlePoint[]) {
  const plotWidth = chartWidth - inset.left - inset.right;
  const plotHeight = chartHeight - inset.top - inset.bottom;
  const rawMin = Math.min(...points.map((point) => point.low));
  const rawMax = Math.max(...points.map((point) => point.high));
  const padding = Math.max((rawMax - rawMin) * .12, rawMax * .008, .01);
  const min = rawMin - padding;
  const max = rawMax + padding;
  const bandWidth = plotWidth / Math.max(points.length, 1);
  const candleWidth = Math.max(2.5, Math.min(9, bandWidth * .58));
  const x = (index: number) => inset.left + (index + .5) * bandWidth;
  const y = (price: number) => inset.top + (max - price) / (max - min) * plotHeight;
  const ticks = [max, (max + min) / 2, min];
  const indexAt = (position: number) => Math.max(0, Math.min(points.length - 1, Math.floor((position - inset.left) / bandWidth)));
  return { candleWidth, indexAt, ticks, x, y, plotHeight, plotWidth };
}

function signedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

interface StockDailyChartProps {
  node: AnalysisNode;
  collapsed: boolean;
  peeking: boolean;
  onCollapse: () => void;
}

export function StockDailyChart({ node, collapsed, peeking, onCollapse }: StockDailyChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [points, setPoints] = useState<AnalysisDailyPoint[]>(node.dailyPrices || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryRevision, setRetryRevision] = useState(0);

  useEffect(() => {
    const embedded = node.dailyPrices || [];
    setHoveredIndex(null);
    setPoints(embedded);
    setError(null);
    if (hasCandles(embedded) || !node.symbol) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ symbol: node.symbol! });
      void fetch(`${apiUrl("/api/analysis/stock-daily")}?${params}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) {
            const failure = await response.json().catch(() => null) as { error?: string } | null;
            throw new Error(failure?.error || "日线行情暂不可用，请稍后重试");
          }
          const payload = await response.json() as AnalysisDailySeries;
          setPoints(payload.points);
        })
        .catch((reason: unknown) => {
          if (reason instanceof DOMException && reason.name === "AbortError") return;
          setError(reason instanceof Error ? reason.message : "日线行情暂不可用");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [node.dailyPrices, node.id, node.symbol, retryRevision]);

  const candles = useMemo(() => normalizeCandles(points), [points]);
  const model = useMemo(() => candles.length ? chartModel(candles) : null, [candles]);
  const first = candles[0];
  const last = candles.at(-1);
  const change = first && last ? (last.close / first.close - 1) * 100 : null;
  const direction = change === null || change === 0 ? "flat" : change > 0 ? "up" : "down";
  const selected = hoveredIndex === null ? last : candles[hoveredIndex];
  const selectedChange = selected ? (selected.close / selected.open - 1) * 100 : null;

  const selectPoint = (clientX: number) => {
    if (!wrapRef.current || !model || candles.length < 2) return;
    const bounds = wrapRef.current.getBoundingClientRect();
    const position = (clientX - bounds.left) / bounds.width * chartWidth;
    setHoveredIndex(model.indexAt(position));
  };

  return (
    <section id="stock-daily-shell" className={`stock-daily-panel is-${direction} ${collapsed ? "is-collapsed" : ""} ${peeking ? "is-auto-peek" : ""}`} aria-labelledby="stock-daily-title" aria-hidden={collapsed || undefined}>
      <header>
        <div className="insight-panel-title">
          <ChartNoAxesCombined size={15} />
          <div>
            <span>近一月日 K</span>
            <h2 id="stock-daily-title">{analysisNodeLabel(node)}</h2>
          </div>
        </div>
        <div className="insight-panel-actions">
          <div className="daily-quote">
            <strong>{selected?.close.toFixed(2) || "--"}</strong>
            <span>{selected ? shortDate(selected.date) : "--"}</span>
            {selectedChange !== null ? <b className={selectedChange > 0 ? "is-up" : selectedChange < 0 ? "is-down" : "is-flat"}>{signedPercent(selectedChange)}</b> : null}
          </div>
          <button id="daily-chart-collapse" type="button" className="insight-panel-collapse" onClick={onCollapse} aria-controls="stock-daily-shell" aria-expanded="true" title="折叠日 K 线图" aria-label="折叠日 K 线图"><PanelRightClose size={15} /></button>
        </div>
      </header>
      {!model ? <div className={`insight-panel-empty ${error ? "is-error" : ""}`}>
        {loading ? <LoaderCircle className="is-spinning" size={22} /> : error ? <CircleAlert size={22} /> : <ChartNoAxesCombined size={22} />}
        <span>{loading ? "正在获取日线行情" : error || "日线行情暂不可用"}</span>
        {error ? <button type="button" className="daily-chart-retry" onClick={() => setRetryRevision((value) => value + 1)}><RotateCcw size={15} />重试</button> : null}
      </div> : (
        <div
          className="stock-daily-chart"
          ref={wrapRef}
          onPointerMove={(event) => selectPoint(event.clientX)}
          onPointerLeave={() => setHoveredIndex(null)}
        >
          {selected ? (
            <div className="daily-chart-readout" aria-live="polite">
              <span>开 <b>{selected.open.toFixed(2)}</b></span>
              <span>高 <b>{selected.high.toFixed(2)}</b></span>
              <span>低 <b>{selected.low.toFixed(2)}</b></span>
              <span>收 <b>{selected.close.toFixed(2)}</b></span>
              {change !== null ? <span className={direction === "up" ? "is-up" : direction === "down" ? "is-down" : "is-flat"}>月 <b>{signedPercent(change)}</b></span> : null}
            </div>
          ) : null}
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={`${analysisNodeLabel(node)}近一月日 K 线图`} preserveAspectRatio="xMidYMid meet">
            {model.ticks.map((tick) => {
              const y = model.y(tick);
              return <g key={tick}><line className="daily-chart-grid" x1={inset.left} x2={inset.left + model.plotWidth} y1={y} y2={y} /><text className="daily-chart-axis" x={inset.left - 7} y={y + 3} textAnchor="end">{tick.toFixed(2)}</text></g>;
            })}
            <g className="daily-candles">
              {candles.map((point, index) => {
                const candleDirection = point.close > point.open ? "up" : point.close < point.open ? "down" : "flat";
                const bodyTop = Math.min(model.y(point.open), model.y(point.close));
                const bodyHeight = Math.max(1.4, Math.abs(model.y(point.open) - model.y(point.close)));
                return (
                  <g className={`daily-candle is-${candleDirection} ${hoveredIndex === index ? "is-selected" : ""}`} key={point.date}>
                    <line className="daily-candle-wick" x1={model.x(index)} x2={model.x(index)} y1={model.y(point.high)} y2={model.y(point.low)} />
                    <rect
                      className="daily-candle-body"
                      x={model.x(index) - model.candleWidth / 2}
                      y={bodyTop}
                      width={model.candleWidth}
                      height={bodyHeight}
                    />
                    <title>{`${point.date} 开 ${point.open.toFixed(2)} 高 ${point.high.toFixed(2)} 低 ${point.low.toFixed(2)} 收 ${point.close.toFixed(2)}`}</title>
                  </g>
                );
              })}
            </g>
            <text className="daily-chart-axis" x={inset.left} y={chartHeight - 7}>{shortDate(first!.date)}</text>
            <text className="daily-chart-axis" x={inset.left + model.plotWidth} y={chartHeight - 7} textAnchor="end">{shortDate(last!.date)}</text>
            {selected && hoveredIndex !== null ? (
              <g className="daily-chart-cursor">
                <line x1={model.x(hoveredIndex)} x2={model.x(hoveredIndex)} y1={inset.top} y2={inset.top + model.plotHeight} />
              </g>
            ) : null}
          </svg>
        </div>
      )}
    </section>
  );
}
