import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Activity, ChartNoAxesCombined, ChevronDown, ChevronUp, Clock3 } from "lucide-react";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import type { MarketPoint, MarketSnapshot } from "../../shared/types";
import { formatClock, formatFull } from "../lib/time";

interface MarketChartProps {
  market: MarketSnapshot | null;
  replaying: boolean;
}

interface ChartGeometry {
  width: number;
  height: number;
  left: number;
  top: number;
  plotWidth: number;
  plotHeight: number;
}

const initialSize = { width: 0, height: 0 };

export function MarketChart({ market, replaying }: MarketChartProps) {
  const [showAverage, setShowAverage] = useState(true);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [size, setSize] = useState(initialSize);
  const [mobileExpanded, setMobileExpanded] = useState(() => typeof window === "undefined" || !window.matchMedia("(max-width: 840px)").matches);
  const canvasRef = useRef<HTMLDivElement>(null);
  const points = market?.points || [];
  const latest = points.at(-1);
  const hasAverage = points.some((point) => point.average !== null);
  const positive = (latest?.change || 0) >= 0;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const updateSize = () => {
      const bounds = canvas.getBoundingClientRect();
      setSize((current) => {
        const next = { width: Math.round(bounds.width), height: Math.round(bounds.height) };
        return current.width === next.width && current.height === next.height ? current : next;
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const domain = useMemo<[number, number]>(() => {
    if (!points.length) return [0, 1];
    const values = points.flatMap((point) => point.average == null ? [point.price] : [point.price, point.average]);
    if (market?.previousClose) values.push(market.previousClose);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = Math.max((max - min) * 0.15, max * 0.0015);
    return [Math.floor((min - padding) * 100) / 100, Math.ceil((max + padding) * 100) / 100];
  }, [market?.previousClose, points]);

  const geometry = useMemo<ChartGeometry>(() => {
    const width = Math.max(size.width, 240);
    const height = Math.max(size.height, 180);
    const left = 2;
    const right = width < 420 ? 45 : 54;
    const top = 10;
    const bottom = 25;
    return {
      width,
      height,
      left,
      top,
      plotWidth: Math.max(1, width - left - right),
      plotHeight: Math.max(1, height - top - bottom),
    };
  }, [size.height, size.width]);

  const chart = useMemo(() => buildChart(points, market?.previousClose || 0, domain, geometry), [domain, geometry, market?.previousClose, points]);
  const selectedIndex = activeIndex === null ? null : Math.min(activeIndex, Math.max(0, points.length - 1));
  const selectedPoint = selectedIndex === null ? null : points[selectedIndex];
  const selectedX = selectedIndex === null ? null : chart.xAt(selectedIndex);
  const selectedY = selectedPoint ? chart.yAt(selectedPoint.price) : null;

  function selectFromPointer(event: PointerEvent<SVGSVGElement>) {
    if (!points.length) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const localX = (event.clientX - bounds.left) * (geometry.width / Math.max(1, bounds.width));
    const ratio = clamp((localX - geometry.left) / geometry.plotWidth, 0, 1);
    setActiveIndex(Math.round(ratio * Math.max(0, points.length - 1)));
  }

  function handleChartKey(event: KeyboardEvent<SVGSVGElement>) {
    if (!points.length) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    setActiveIndex((current) => {
      if (event.key === "Home") return 0;
      if (event.key === "End") return points.length - 1;
      const start = current ?? points.length - 1;
      return clamp(start + (event.key === "ArrowLeft" ? -1 : 1), 0, points.length - 1);
    });
  }

  return (
    <section className={`market-panel ${mobileExpanded ? "" : "is-mobile-collapsed"}`} aria-label="沪深300分时图">
      <div className="section-heading market-heading">
        <div>
          <div className="eyebrow">CHINA MARKET · 000300</div>
          <h1>沪深300</h1>
        </div>
        <div className="market-quote">
          <strong>{latest ? latest.price.toFixed(2) : "--"}</strong>
          <span className={positive ? "quote-up" : "quote-down"}>
            {latest ? `${positive ? "+" : ""}${latest.change.toFixed(2)}  ${positive ? "+" : ""}${latest.changePercent.toFixed(2)}%` : "等待行情"}
          </span>
        </div>
        <button type="button" className="mobile-market-toggle" onClick={() => setMobileExpanded((value) => !value)} aria-expanded={mobileExpanded} aria-controls="market-chart-details" aria-label={mobileExpanded ? "收起沪深300分时图" : "展开沪深300分时图"}>
          {mobileExpanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
        </button>
      </div>

      <div id="market-chart-details" className="chart-toolbar">
        <div className="chart-state">
          <Activity size={14} />
          <span>{replaying ? "历史时间轴" : market?.delayed ? "行情延迟" : "分时行情"}</span>
          <i className={market?.delayed ? "is-delayed" : ""} />
        </div>
        {hasAverage ? (
          <button className={`legend-toggle ${showAverage ? "is-active" : ""}`} onClick={() => setShowAverage((value) => !value)} aria-pressed={showAverage}>
            <i />均价线
          </button>
        ) : null}
      </div>

      <div className="chart-wrap">
        {points.length ? (
          <div className="market-chart-canvas" ref={canvasRef}>
            <svg
              className="market-chart-svg"
              viewBox={`0 0 ${geometry.width} ${geometry.height}`}
              role="group"
              tabIndex={0}
              aria-label={`沪深300分时行情，共 ${points.length} 个分钟点，最新 ${latest?.price.toFixed(2) || "未知"}`}
              onFocus={() => setActiveIndex((current) => current ?? points.length - 1)}
              onBlur={() => setActiveIndex(null)}
              onKeyDown={handleChartKey}
              onPointerDown={selectFromPointer}
              onPointerMove={selectFromPointer}
              onPointerLeave={(event) => { if (event.pointerType === "mouse") setActiveIndex(null); }}
            >
              {chart.yTicks.map((tick) => (
                <g key={tick.value}>
                  <line className="market-grid-line" x1={geometry.left} x2={geometry.left + geometry.plotWidth} y1={tick.y} y2={tick.y} />
                  <text className="market-axis-label" x={geometry.left + geometry.plotWidth + 7} y={tick.y} dominantBaseline="middle">{tick.value.toFixed(0)}</text>
                </g>
              ))}
              {chart.volumeBars.map((bar) => (
                <rect className="market-volume-bar" key={bar.key} x={bar.x} y={bar.y} width={bar.width} height={bar.height} />
              ))}
              {chart.referenceY !== null ? <line className="market-reference-line" x1={geometry.left} x2={geometry.left + geometry.plotWidth} y1={chart.referenceY} y2={chart.referenceY} /> : null}
              {showAverage && chart.averagePath ? <path className="market-average-line" d={chart.averagePath} /> : null}
              <path className="market-price-line" d={chart.pricePath} />
              {selectedX !== null && selectedY !== null ? (
                <g className="market-crosshair">
                  <line x1={selectedX} x2={selectedX} y1={geometry.top} y2={geometry.top + geometry.plotHeight} />
                  <circle cx={selectedX} cy={selectedY} r="3.5" />
                </g>
              ) : null}
              {chart.xTicks.map((tick) => (
                <text className="market-axis-label market-axis-time" key={tick.index} x={tick.x} y={geometry.height - 5} textAnchor={tick.anchor}>{tick.label}</text>
              ))}
            </svg>
            {selectedPoint && selectedX !== null && selectedY !== null ? (
              <ChartTooltip
                point={selectedPoint}
                previousClose={market?.previousClose || 0}
                style={{
                  left: clamp(selectedX, 72, geometry.width - 72),
                  top: clamp(selectedY + 10, 8, geometry.height - 104),
                }}
              />
            ) : null}
          </div>
        ) : (
          <div className="chart-empty"><ChartNoAxesCombined size={28} /><span>{replaying ? "等待该时刻的行情" : "正在接入沪深300行情"}</span></div>
        )}
      </div>

      <div className="chart-footer">
        <span><Clock3 size={13} />{market?.updatedAt && market.updatedAt !== new Date(0).toISOString() ? `更新于 ${formatFull(market.updatedAt)}` : "等待首次更新"}</span>
        <span title={market?.switchReason || undefined}>数据源：{market?.sourceLabel || "行情聚合"}{market?.latencyMs === null || market?.latencyMs === undefined ? "" : ` · ${market.latencyMs}ms`} · 交易数据或有延迟</span>
      </div>
    </section>
  );
}

function buildChart(points: MarketPoint[], previousClose: number, domain: [number, number], geometry: ChartGeometry) {
  const xAt = (index: number) => geometry.left + (points.length <= 1 ? geometry.plotWidth / 2 : index / (points.length - 1) * geometry.plotWidth);
  const yAt = (value: number) => geometry.top + (domain[1] - value) / Math.max(0.0001, domain[1] - domain[0]) * geometry.plotHeight;
  const pathFrom = (values: Array<{ index: number; value: number }>) => values.map(({ index, value }, pathIndex) => `${pathIndex ? "L" : "M"}${xAt(index).toFixed(2)},${yAt(value).toFixed(2)}`).join(" ");
  const maxVolume = Math.max(1, ...points.map((point) => point.volume || 0));
  const barWidth = Math.max(1, Math.min(4, geometry.plotWidth / Math.max(1, points.length) * 0.72));
  const volumeHeight = geometry.plotHeight * 0.18;
  const yTickCount = 4;
  const xTickCount = Math.min(points.length, geometry.width < 420 ? 4 : 5);
  const xTickIndices = Array.from(new Set(Array.from({ length: xTickCount }, (_, index) => Math.round(index * (points.length - 1) / Math.max(1, xTickCount - 1)))));
  const referenceY = previousClose >= domain[0] && previousClose <= domain[1] ? yAt(previousClose) : null;

  return {
    xAt,
    yAt,
    pricePath: pathFrom(points.map((point, index) => ({ index, value: point.price }))),
    averagePath: pathFrom(points.flatMap((point, index) => point.average === null ? [] : [{ index, value: point.average }])),
    referenceY,
    yTicks: Array.from({ length: yTickCount }, (_, index) => {
      const ratio = index / (yTickCount - 1);
      return { value: domain[1] - ratio * (domain[1] - domain[0]), y: geometry.top + ratio * geometry.plotHeight };
    }),
    xTicks: xTickIndices.map((index, tickIndex) => {
      const anchor: "start" | "middle" | "end" = tickIndex === 0 ? "start" : tickIndex === xTickIndices.length - 1 ? "end" : "middle";
      return {
        index,
        x: xAt(index),
        label: formatClock(points[index].timestamp).slice(0, 5),
        anchor,
      };
    }),
    volumeBars: points.map((point, index) => {
      const height = (point.volume || 0) / maxVolume * volumeHeight;
      return { key: `${point.timestamp}-${index}`, x: xAt(index) - barWidth / 2, y: geometry.top + geometry.plotHeight - height, width: barWidth, height };
    }),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function ChartTooltip({ point, previousClose, style }: { point: MarketPoint; previousClose: number; style: CSSProperties }) {
  const positive = point.price >= previousClose;
  return (
    <div className="chart-tooltip" style={style} role="status">
      <time>{formatFull(point.timestamp)}</time>
      <strong className={positive ? "quote-up" : "quote-down"}>{point.price.toFixed(2)}</strong>
      <span>均价 {point.average?.toFixed(2) || "--"}</span>
      <span>涨跌 {positive ? "+" : ""}{point.changePercent.toFixed(2)}%</span>
    </div>
  );
}
