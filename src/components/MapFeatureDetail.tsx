import { Crosshair, ExternalLink, MapPin, X } from "lucide-react";
import type { RefObject } from "react";
import type { MapFeature } from "../../shared/types";
import { formatFull } from "../lib/time";
import { mapLayers } from "./MapLayerPanel";

const positionLabels = { "source-reported": "来源提供位置", "reference-route": "静态航路示意", predicted: "轨道推算 · 地面投影", "approximate-region": "国家或地区中心" };
const timeLabels = { observation: "观测时间", issued: "通报时间", updated: "来源更新时间", prediction: "轨道元素历元", reference: "静态参考" };
const detailValue = (value: string) => value.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, stamp => Number.isFinite(Date.parse(stamp)) ? formatFull(stamp) : stamp);

export function MapFeatureDetail({ feature, detailRef, onClose, onNews }: { feature: MapFeature; detailRef: RefObject<HTMLElement>; onClose: () => void; onNews: (id: string) => void }) {
  const p = feature.properties;
  const layer = mapLayers.find(layer => layer.id === p.layer);
  let sourceUrl: string | null = null;
  try { const url = new URL(p.sourceUrl); if (url.protocol === "https:" || url.protocol === "http:") sourceUrl = url.href; } catch { /* No untrusted link. */ }
  return <section className="economic-detail economic-panel economic-map-detail" ref={detailRef} tabIndex={-1} aria-labelledby="economic-map-detail-title">
    <div className="economic-detail-eyebrow"><span><Crosshair size={12} />MAP INTELLIGENCE</span><button type="button" className="economic-icon-button" aria-label="关闭地图详情" onClick={onClose}><X size={15} /></button></div>
    <h2 id="economic-map-detail-title">{p.name}</h2>
    <div className="economic-detail-tags"><span style={{ color: layer?.color }}>{layer?.label}</span><span>{positionLabels[p.positionKind]}</span></div>
    <div className="economic-detail-meta"><span>{p.sourceLabel}</span><span>{p.eventType}</span></div>
    <p className="economic-detail-content">{p.description}</p>
    <dl className="economic-map-facts"><div><dt>{timeLabels[p.timeKind]}</dt><dd>{p.sourceTime ? formatFull(p.sourceTime) : "无实时观测时间"}</dd></div>
      {p.positionTime && p.positionKind === "predicted" ? <div><dt>位置推算时间</dt><dd>{formatFull(p.positionTime)}</dd></div> : null}
      <div><dt><MapPin size={12} />标记经纬度</dt><dd>{p.anchor[0].toFixed(3)}°, {p.anchor[1].toFixed(3)}°</dd></div>
      {p.details?.map((detail, index) => <div key={`${index}:${detail.label}`}><dt>{detail.label.replace(/\s*[（(]UTC[）)]/g, "")}</dt><dd>{detailValue(detail.value)}</dd></div>)}
    </dl>
    {p.relatedNewsId ? <button type="button" className="economic-map-related" onClick={() => onNews(p.relatedNewsId!)}>查看关联通报</button> : null}
    <div className="economic-detail-bottom"><span>时间均为北京时间</span>{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">查看来源<ExternalLink size={12} /></a> : null}</div>
  </section>;
}
