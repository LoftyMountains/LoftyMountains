import { useMemo, useState } from "react";
import { Activity, ChartNoAxesCombined, Clock3 } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MarketPoint, MarketSnapshot } from "../../shared/types";
import { formatClock, formatFull } from "../lib/time";

interface MarketChartProps {
  market: MarketSnapshot | null;
  replaying: boolean;
}

export function MarketChart({ market, replaying }: MarketChartProps) {
  const [showAverage, setShowAverage] = useState(true);
  const points = market?.points || [];
  const latest = points.at(-1);
  const hasAverage = points.some((point) => point.average !== null);
  const positive = (latest?.change || 0) >= 0;
  const domain = useMemo<[number, number]>(() => {
    if (!points.length) return [0, 1];
    const values = points.flatMap((point) => point.average == null ? [point.price] : [point.price, point.average]);
    if (market?.previousClose) values.push(market.previousClose);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = Math.max((max - min) * 0.15, max * 0.0015);
    return [Math.floor((min - padding) * 100) / 100, Math.ceil((max + padding) * 100) / 100];
  }, [market?.previousClose, points]);

  return (
    <section className="market-panel" aria-label="沪深300分时图">
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
      </div>

      <div className="chart-toolbar">
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
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 12, right: 6, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="timestamp"
                tickFormatter={(value) => formatClock(value).slice(0, 5)}
                minTickGap={44}
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                axisLine={{ stroke: "var(--chart-axis)" }}
                tickLine={false}
              />
              <YAxis
                yAxisId="price"
                orientation="right"
                domain={domain}
                width={58}
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => Number(value).toFixed(0)}
              />
              <YAxis yAxisId="volume" domain={[0, (max: number) => max * 5]} hide />
              <Tooltip content={<ChartTooltip previousClose={market?.previousClose || 0} />} cursor={{ stroke: "var(--chart-cursor)", strokeWidth: 1 }} />
              <Bar yAxisId="volume" dataKey="volume" fill="var(--chart-volume)" opacity={0.28} isAnimationActive={false} />
              {market?.previousClose ? <ReferenceLine yAxisId="price" y={market.previousClose} stroke="var(--chart-reference)" strokeDasharray="4 4" /> : null}
              {hasAverage && showAverage ? <Line yAxisId="price" type="monotone" dataKey="average" stroke="var(--gold)" strokeWidth={1.2} dot={false} connectNulls isAnimationActive={false} /> : null}
              <Line yAxisId="price" type="monotone" dataKey="price" stroke="var(--red)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
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

function ChartTooltip({ active, payload, previousClose }: { active?: boolean; payload?: Array<{ payload: MarketPoint }>; previousClose: number }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const positive = point.price >= previousClose;
  return (
    <div className="chart-tooltip">
      <time>{formatFull(point.timestamp)}</time>
      <strong className={positive ? "quote-up" : "quote-down"}>{point.price.toFixed(2)}</strong>
      <span>均价 {point.average?.toFixed(2) || "--"}</span>
      <span>涨跌 {positive ? "+" : ""}{point.changePercent.toFixed(2)}%</span>
    </div>
  );
}
