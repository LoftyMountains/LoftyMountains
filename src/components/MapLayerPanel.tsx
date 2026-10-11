import { CloudLightning, Globe2, Plane, Satellite, ShieldPlus, Ship } from "lucide-react";
import type { CSSProperties } from "react";
import type { MapLayerId, MapLayerStatus, MapOverlaysSnapshot } from "../../shared/types";

import { formatClock, relativeTime } from "../lib/time";
import type { AviationCenter, AviationMode } from "../lib/live-aviation";

export const mapLayers = [
  { id: "weather", label: "Weather & disasters", icon: CloudLightning, color: "#78cddd", meaning: "Source positions and areas" },
  { id: "aviation", label: "Aviation", icon: Plane, color: "#91bdf4", meaning: "Last observed positions" },
  { id: "maritime", label: "Shipping routes", icon: Ship, color: "#79cab0", meaning: "Static route reference" },
  { id: "satellites", label: "Satellites", icon: Satellite, color: "#b5a0ed", meaning: "Predicted · select to view track" },
  { id: "health", label: "Public health", icon: ShieldPlus, color: "#e0a6b6", meaning: "Regions mentioned in advisories" },
] as const;
const stateLabels = { live: "Updated", stale: "Delayed", unavailable: "No data", reference: "Static reference" };

export function MapLayerPanel({ snapshot, error, enabled, onToggle, newsVisible, onNewsToggle, newsCount, refreshing, onRefresh, aviation }: {
  snapshot: MapOverlaysSnapshot | null; error: string | null; enabled: Set<MapLayerId>; onToggle: (id: MapLayerId) => void;
  aviation: { mode: AviationMode; onMode: (mode: AviationMode) => void; scope: AviationCenter & { radiusNm: number }; status: MapLayerStatus | null; error: string | null; refreshing: boolean; latestObservedAt: string | null };
  newsVisible: boolean; onNewsToggle: () => void; newsCount: number; refreshing: boolean; onRefresh: () => void;
}) {
  return <section className="economic-spatial-layers" aria-label="Map data layers">
    <div className="economic-section-label"><span>Map layers</span><button type="button" onClick={onRefresh} disabled={refreshing}>{refreshing ? "Syncing…" : "Refresh layers"}</button></div>
    <div className="economic-spatial-list">{mapLayers.map(({ id, label, icon: Icon, color, meaning }) => {
      const status = id === "aviation" ? aviation.status : snapshot?.layers.find(layer => layer.id === id);
      const layerError = id === "aviation" ? aviation.error : error;
      return <div className="economic-spatial-entry" key={id}>
        <button type="button" className="economic-layer economic-spatial-toggle" style={{ "--category-color": color } as CSSProperties} aria-pressed={enabled.has(id)} onClick={() => onToggle(id)} title={status?.message || meaning}>
          <span className="economic-layer-icon"><Icon size={17} /></span><span className="economic-spatial-name"><span>{label}</span><small>{meaning}</small></span>
          <span className="economic-layer-count">{status?.count ?? "—"}</span><span className="economic-toggle" aria-hidden="true"><i /></span>
        </button>
        {enabled.has(id) ? <div className={`economic-spatial-state is-${layerError ? "stale" : status?.state || "loading"}`}><i />{layerError ? "Connection issue" : status ? stateLabels[status.state] : "Connecting"}<span>{status?.sources.join(" · ")}</span></div> : null}
        {id === "aviation" ? <div className="economic-aviation-controls">
          <div className="economic-aviation-mode" role="group" aria-label="Aircraft coverage mode">
            <button type="button" aria-pressed={aviation.mode === "live"} onClick={() => aviation.onMode("live")}>Live area</button>
            <button type="button" aria-pressed={aviation.mode === "global"} onClick={() => aviation.onMode("global")}>Global sample</button>
          </div>
          <p className="economic-aviation-scope">{aviation.mode === "live" ? `${aviation.scope.radiusNm} NM around ${Math.abs(aviation.scope.latitude)}°${aviation.scope.latitude < 0 ? "S" : "N"}, ${Math.abs(aviation.scope.longitude)}°${aviation.scope.longitude < 0 ? "W" : "E"}` : "Global spatial sample · ~16 min refresh"}</p>
          <p>{!enabled.has("aviation") ? "Updates paused · layer off" : aviation.refreshing ? "Checking for observations…" : aviation.status?.updatedAt ? `Retrieved ${formatClock(aviation.status.updatedAt)} UTC+8` : "Waiting for observations"}</p>
          <p>{aviation.latestObservedAt ? `Latest position observed ${relativeTime(aviation.latestObservedAt)}` : "No current observed positions"}</p>
          {aviation.mode === "live" ? <><p>~30s checks · positions expire after 2 min</p><p className="economic-aviation-attribution"><a href="https://adsb.lol/" target="_blank" rel="noreferrer">ADSB.lol</a><span>·</span><a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL</a></p></> : <p>OpenSky · positions expire after 20 min</p>}
        </div> : null}
        {enabled.has(id) && (layerError || status && (status.state === "unavailable" || status.state === "stale")) ? <p className="economic-spatial-notice">{layerError || status?.message}</p> : null}
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
