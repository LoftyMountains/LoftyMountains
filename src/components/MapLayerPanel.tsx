import { CloudLightning, Globe2, Plane, Satellite, ShieldPlus, Ship } from "lucide-react";
import type { CSSProperties } from "react";
import type { MapLayerId, MapOverlaysSnapshot } from "../../shared/types";

export const mapLayers = [
  { id: "weather", label: "Weather & disasters", icon: CloudLightning, color: "#78cddd", meaning: "Source positions and areas" },
  { id: "aviation", label: "Aviation", icon: Plane, color: "#91bdf4", meaning: "Last observed positions" },
  { id: "maritime", label: "Shipping routes", icon: Ship, color: "#79cab0", meaning: "Static route reference" },
  { id: "satellites", label: "Satellites", icon: Satellite, color: "#b5a0ed", meaning: "Predicted · select to view track" },
  { id: "health", label: "Public health", icon: ShieldPlus, color: "#e0a6b6", meaning: "Regions mentioned in advisories" },
] as const;
const stateLabels = { live: "Updated", stale: "Delayed", unavailable: "No data", reference: "Static reference" };

export function MapLayerPanel({ snapshot, error, enabled, onToggle, newsVisible, onNewsToggle, newsCount, refreshing, onRefresh }: {
  snapshot: MapOverlaysSnapshot | null; error: string | null; enabled: Set<MapLayerId>; onToggle: (id: MapLayerId) => void;
  newsVisible: boolean; onNewsToggle: () => void; newsCount: number; refreshing: boolean; onRefresh: () => void;
}) {
  return <section className="economic-spatial-layers" aria-label="Map data layers">
    <div className="economic-section-label"><span>Map layers</span><button type="button" onClick={onRefresh} disabled={refreshing}>{refreshing ? "Syncing…" : "Refresh layers"}</button></div>
    <div className="economic-spatial-list">{mapLayers.map(({ id, label, icon: Icon, color, meaning }) => {
      const status = snapshot?.layers.find(layer => layer.id === id);
      return <div className="economic-spatial-entry" key={id}>
        <button type="button" className="economic-layer economic-spatial-toggle" style={{ "--category-color": color } as CSSProperties} aria-pressed={enabled.has(id)} onClick={() => onToggle(id)} title={status?.message || meaning}>
          <span className="economic-layer-icon"><Icon size={17} /></span><span className="economic-spatial-name"><span>{label}</span><small>{meaning}</small></span>
          <span className="economic-layer-count">{status?.count ?? "—"}</span><span className="economic-toggle" aria-hidden="true"><i /></span>
        </button>
        {enabled.has(id) ? <div className={`economic-spatial-state is-${error ? "stale" : status?.state || "loading"}`}><i />{error ? "Connection issue" : status ? stateLabels[status.state] : "Connecting"}<span>{status?.sources.join(" · ")}</span></div> : null}
        {enabled.has(id) && status && (status.state === "unavailable" || status.state === "stale") ? <p className="economic-spatial-notice">{status.message}</p> : null}
      </div>;
    })}
    <button type="button" className="economic-layer economic-spatial-toggle" aria-pressed={newsVisible} onClick={onNewsToggle} style={{ "--category-color": "#d6b779" } as CSSProperties}>
      <span className="economic-layer-icon"><Globe2 size={16} /></span><span className="economic-spatial-name"><span>News location markers</span><small>Count of news mentioning each place</small></span><span className="economic-layer-count">{newsCount}</span><span className="economic-toggle" aria-hidden="true"><i /></span>
    </button></div>
    {error ? <p className="economic-spatial-notice" role="status">{error}{snapshot ? ". Previous snapshot shown for reference." : "."}</p> : null}
  </section>;
}

export function MapLegend({ enabled, newsVisible }: { enabled: Set<MapLayerId>; newsVisible: boolean }) {
  return <aside className="economic-map-legend economic-panel" aria-label="Map legend"><strong>Map legend</strong><div>{mapLayers.filter(layer => enabled.has(layer.id)).map(({ id, label, icon: Icon, color, meaning }) => <span key={id} title={meaning}><Icon size={12} style={{ color }} /><span>{id === "weather" ? "Weather" : id === "maritime" ? "Shipping" : label}</span></span>)}{newsVisible ? <span><i className="economic-legend-count">N</i>News mentions</span> : null}</div><small>Solid: source areas · Dashed: reference or prediction</small></aside>;
}
