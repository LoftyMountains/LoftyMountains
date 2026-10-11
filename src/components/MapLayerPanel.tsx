import { CloudLightning, Globe2, Plane, Satellite, ShieldPlus, Ship } from "lucide-react";
import type { CSSProperties } from "react";
import type { MapLayerId, MapOverlaysSnapshot } from "../../shared/types";

export const mapLayers = [
  { id: "weather", label: "气象与灾害", icon: CloudLightning, color: "#78cddd", meaning: "来源位置与范围" },
  { id: "aviation", label: "航空动态", icon: Plane, color: "#91bdf4", meaning: "最近观测位置" },
  { id: "maritime", label: "航运通道", icon: Ship, color: "#79cab0", meaning: "静态航路示意" },
  { id: "satellites", label: "在轨卫星", icon: Satellite, color: "#b5a0ed", meaning: "推算位置 · 点选查看轨迹" },
  { id: "health", label: "公共卫生", icon: ShieldPlus, color: "#e0a6b6", meaning: "通报涉及地区" },
] as const;
const stateLabels = { live: "已更新", stale: "更新延迟", unavailable: "暂无数据", reference: "静态参考" };

export function MapLayerPanel({ snapshot, error, enabled, onToggle, newsVisible, onNewsToggle, newsCount, refreshing, onRefresh }: {
  snapshot: MapOverlaysSnapshot | null; error: string | null; enabled: Set<MapLayerId>; onToggle: (id: MapLayerId) => void;
  newsVisible: boolean; onNewsToggle: () => void; newsCount: number; refreshing: boolean; onRefresh: () => void;
}) {
  return <section className="economic-spatial-layers" aria-label="地图数据图层">
    <div className="economic-section-label"><span>地图图层</span><button type="button" onClick={onRefresh} disabled={refreshing}>{refreshing ? "同步中…" : "刷新图层"}</button></div>
    <div className="economic-spatial-list">{mapLayers.map(({ id, label, icon: Icon, color, meaning }) => {
      const status = snapshot?.layers.find(layer => layer.id === id);
      return <div className="economic-spatial-entry" key={id}>
        <button type="button" className="economic-layer economic-spatial-toggle" style={{ "--category-color": color } as CSSProperties} aria-pressed={enabled.has(id)} onClick={() => onToggle(id)} title={status?.message || meaning}>
          <span className="economic-layer-icon"><Icon size={17} /></span><span className="economic-spatial-name"><span>{label}</span><small>{meaning}</small></span>
          <span className="economic-layer-count">{status?.count ?? "—"}</span><span className="economic-toggle" aria-hidden="true"><i /></span>
        </button>
        {enabled.has(id) ? <div className={`economic-spatial-state is-${error ? "stale" : status?.state || "loading"}`}><i />{error ? "连接异常" : status ? stateLabels[status.state] : "连接中"}<span>{status?.sources.join(" · ")}</span></div> : null}
        {enabled.has(id) && status && (status.state === "unavailable" || status.state === "stale") ? <p className="economic-spatial-notice">{status.message}</p> : null}
      </div>;
    })}
    <button type="button" className="economic-layer economic-spatial-toggle" aria-pressed={newsVisible} onClick={onNewsToggle} style={{ "--category-color": "#d6b779" } as CSSProperties}>
      <span className="economic-layer-icon"><Globe2 size={16} /></span><span className="economic-spatial-name"><span>新闻地区标记</span><small>数字为提及地区的消息数</small></span><span className="economic-layer-count">{newsCount}</span><span className="economic-toggle" aria-hidden="true"><i /></span>
    </button></div>
    {error ? <p className="economic-spatial-notice" role="status">{error}{snapshot ? "；上次快照仅供参考。" : "。"}</p> : null}
  </section>;
}

export function MapLegend({ enabled, newsVisible }: { enabled: Set<MapLayerId>; newsVisible: boolean }) {
  return <aside className="economic-map-legend economic-panel" aria-label="地图图例"><strong>地图图例</strong><div>{mapLayers.filter(layer => enabled.has(layer.id)).map(({ id, label, icon: Icon, color, meaning }) => <span key={id} title={meaning}><Icon size={12} style={{ color }} /><span>{label}</span></span>)}{newsVisible ? <span><i className="economic-legend-count">N</i>新闻提及</span> : null}</div><small>实线：来源范围　虚线：参考或预测</small></aside>;
}
