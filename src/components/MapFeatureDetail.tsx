import { ArrowUpRight, Crosshair, ExternalLink, MapPin, X } from "lucide-react";
import type { RefObject } from "react";
import type { MapFeature } from "../../shared/types";
import { formatFull } from "../lib/time";
import { LIVE_AIRCRAFT_FRESH_MS } from "../lib/live-aviation";
import { mapLayers } from "./MapLayerPanel";

const positionLabels = { "source-reported": "Source-reported position", "reference-route": "Static route reference", predicted: "Predicted ground position", "approximate-region": "Country or regional center" };
const timeLabels = { observation: "Observed at", issued: "Issued at", updated: "Source update time", prediction: "Orbital epoch", reference: "Static reference" };
function safeLink(value: string | null) { try { const url = new URL(value || ""); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; } }
const detailValue = (value: string) => value.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, stamp => Number.isFinite(Date.parse(stamp)) ? formatFull(stamp) : stamp);

export function MapFeatureDetail({ feature, detailRef, onClose, onNews, onSource, now = Date.now() }: { feature: MapFeature; detailRef: RefObject<HTMLElement>; onClose: () => void; onNews: (id: string) => void; onSource?: (id: string) => void; now?: number }) {
  const p = feature.properties;
  const liveObservationAge = p.sourceId === "adsb-lol" && p.sourceTime ? Math.max(0, now - Date.parse(p.sourceTime)) : null;
  const eventType = liveObservationAge !== null ? liveObservationAge > LIVE_AIRCRAFT_FRESH_MS ? "Aircraft last observed position" : "Current aircraft observation" : p.eventType;
  const layer = mapLayers.find(layer => layer.id === p.layer);
  const transformation = p.positionKind === "predicted" ? "Public orbital elements → SGP4 propagation → ground position and future track. These are modeled positions, not measured satellite positions or imagery."
    : p.positionKind === "reference-route" ? "Public corridor references → curated route illustration. Lines do not show current vessel positions, actual tracks or live corridor status."
      : p.positionKind === "approximate-region" ? "Advisory text → place-name matching → approximate country or regional center. Markers do not show case counts or precise case locations."
        : p.layer === "aviation" ? `Receiver-network position reports → validity and freshness checks → ${p.sourceId === "adsb-lol" ? "bounded regional sample" : "global sample"}. The last observed position is shown without extrapolating flight paths.`
          : "Public source records → coordinate and freshness checks → map display. Positions and areas come from the source; marker anchors do not establish a confirmed impact area.";
  let sourceUrl: string | null = null;
  try { const url = new URL(p.sourceUrl); if (url.protocol === "https:" || url.protocol === "http:") sourceUrl = url.href; } catch { /* No untrusted link. */ }
  return <section className="economic-detail economic-panel economic-map-detail" ref={detailRef} tabIndex={-1} aria-labelledby="economic-map-detail-title">
    <div className="economic-detail-eyebrow"><span><Crosshair size={12} />MAP INTELLIGENCE</span><button type="button" className="economic-icon-button" aria-label="Close map details" onClick={onClose}><X size={15} /></button></div>
    <h2 id="economic-map-detail-title">{p.name}</h2>
    <div className="economic-detail-tags"><span style={{ color: layer?.color }}>{layer?.label}</span><span>{positionLabels[p.positionKind]}</span></div>
    <div className="economic-detail-meta"><span>{p.sourceLabel}</span><span>{eventType}</span></div>
    <p className="economic-detail-content">{p.description}</p>
    <p className="map-evidence-transform"><strong>How this position is generated</strong>{transformation}</p>
    {onSource ? <button type="button" className="news-evidence-source" onClick={() => onSource(p.sourceId)}>{p.evidenceLinks?.length ? "Latest advisory source details" : "View source catalog"}<ArrowUpRight size={12} /></button> : null}
    <dl className="economic-map-facts"><div><dt>{timeLabels[p.timeKind]}</dt><dd>{p.sourceTime ? formatFull(p.sourceTime) : "No live observation time"}</dd></div>
      {p.positionTime && p.positionKind === "predicted" ? <div><dt>Position prediction time</dt><dd>{formatFull(p.positionTime)}</dd></div> : null}
      <div><dt><MapPin size={12} />Marker longitude, latitude</dt><dd>{p.anchor[0].toFixed(3)}°, {p.anchor[1].toFixed(3)}°</dd></div>
      {p.details?.map((detail, index) => <div key={`${index}:${detail.label}`}><dt>{detail.label.replace(/\s*[（(]UTC[）)]/g, "")}</dt><dd>{liveObservationAge !== null && detail.label === "Observation age" ? `${Math.round(liveObservationAge / 1000)} seconds` : detailValue(detail.value)}</dd></div>)}
    </dl>
    {p.evidenceLinks?.length ? <details className="map-evidence-links"><summary>Original regional advisories · {p.evidenceLinks.length}</summary><ol>{p.evidenceLinks.map(record => <li key={`${record.sourceId}:${record.newsId}`}>
      {safeLink(record.url) ? <a href={safeLink(record.url)!} target="_blank" rel="noreferrer">{record.label}<ExternalLink size={10} /></a> : <span>{record.label}</span>}
      <span><time dateTime={record.publishedAt}>{formatFull(record.publishedAt)}</time>{onSource ? <button type="button" className="news-evidence-source" onClick={() => onSource(record.sourceId)}>Source catalog<ArrowUpRight size={10} /></button> : null}</span>
    </li>)}</ol></details> : null}
    {p.relatedNewsId ? <button type="button" className="economic-map-related" onClick={() => onNews(p.relatedNewsId!)}>View related advisory</button> : null}
    {p.sourceId === "adsb-lol" ? <p className="map-evidence-transform">Aircraft data: <a href="https://www.adsb.lol/" target="_blank" rel="noreferrer">ADSB.lol</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL 1.0</a></p> : null}
    <div className="economic-detail-bottom"><span>Display times UTC+8; source text retains its stated timezone</span>{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">{p.evidenceLinks?.length ? "Read latest advisory" : "View source"}<ExternalLink size={12} /></a> : null}</div>
  </section>;
}
