import { ArrowUpRight, Crosshair, ExternalLink, MapPin, X } from "lucide-react";
import type { RefObject } from "react";
import type { MapFeature } from "../../shared/types";
import { formatFull } from "../lib/time";
import { mapLayers } from "./MapLayerPanel";

const positionLabels = { "source-reported": "来源提供位置", "reference-route": "静态航路示意", predicted: "轨道推算 · 地面投影", "approximate-region": "国家或地区中心" };
const timeLabels = { observation: "观测时间", issued: "通报时间", updated: "来源更新时间", prediction: "轨道元素历元", reference: "静态参考" };
function safeLink(value: string | null) { try { const url = new URL(value || ""); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; } }
const detailValue = (value: string) => value.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, stamp => Number.isFinite(Date.parse(stamp)) ? formatFull(stamp) : stamp);

export function MapFeatureDetail({ feature, detailRef, onClose, onNews, onSource }: { feature: MapFeature; detailRef: RefObject<HTMLElement>; onClose: () => void; onNews: (id: string) => void; onSource?: (id: string) => void }) {
  const p = feature.properties;
  const layer = mapLayers.find(layer => layer.id === p.layer);
  const transformation = p.positionKind === "predicted" ? "公开轨道元素 → SGP4 轨道推算 → 地面投影与未来轨迹。这里显示模型计算结果，不是卫星实测位置或卫星影像。"
    : p.positionKind === "reference-route" ? "公开通道资料 → 人工整理航路示意。线条不代表船舶当前位置、实际航迹或通道实时运行状态。"
      : p.positionKind === "approximate-region" ? "通报文本 → 地区名称规则匹配 → 国家或地区近似中心。符号不代表病例数量或病例精确位置。"
        : p.layer === "aviation" ? "航空接收网络位置记录 → 有效性与时效检查 → 全球抽样展示。使用最近观测位置，不外推飞行轨迹。"
          : "来源公开事件记录 → 坐标与时效检查 → 地图绘制。位置或范围由来源提供，标记锚点不等于已确认的灾害影响范围。";
  let sourceUrl: string | null = null;
  try { const url = new URL(p.sourceUrl); if (url.protocol === "https:" || url.protocol === "http:") sourceUrl = url.href; } catch { /* No untrusted link. */ }
  return <section className="economic-detail economic-panel economic-map-detail" ref={detailRef} tabIndex={-1} aria-labelledby="economic-map-detail-title">
    <div className="economic-detail-eyebrow"><span><Crosshair size={12} />MAP INTELLIGENCE</span><button type="button" className="economic-icon-button" aria-label="关闭地图详情" onClick={onClose}><X size={15} /></button></div>
    <h2 id="economic-map-detail-title">{p.name}</h2>
    <div className="economic-detail-tags"><span style={{ color: layer?.color }}>{layer?.label}</span><span>{positionLabels[p.positionKind]}</span></div>
    <div className="economic-detail-meta"><span>{p.sourceLabel}</span><span>{p.eventType}</span></div>
    <p className="economic-detail-content">{p.description}</p>
    <p className="map-evidence-transform"><strong>位置如何生成</strong>{transformation}</p>
    {onSource ? <button type="button" className="news-evidence-source" onClick={() => onSource(p.sourceId)}>{p.evidenceLinks?.length ? "最新通报来源目录" : "查看来源目录"}<ArrowUpRight size={12} /></button> : null}
    <dl className="economic-map-facts"><div><dt>{timeLabels[p.timeKind]}</dt><dd>{p.sourceTime ? formatFull(p.sourceTime) : "无实时观测时间"}</dd></div>
      {p.positionTime && p.positionKind === "predicted" ? <div><dt>位置推算时间</dt><dd>{formatFull(p.positionTime)}</dd></div> : null}
      <div><dt><MapPin size={12} />标记经纬度</dt><dd>{p.anchor[0].toFixed(3)}°, {p.anchor[1].toFixed(3)}°</dd></div>
      {p.details?.map((detail, index) => <div key={`${index}:${detail.label}`}><dt>{detail.label.replace(/\s*[（(]UTC[）)]/g, "")}</dt><dd>{detailValue(detail.value)}</dd></div>)}
    </dl>
    {p.evidenceLinks?.length ? <details className="map-evidence-links"><summary>本地区原始通报 · {p.evidenceLinks.length} 条</summary><ol>{p.evidenceLinks.map(record => <li key={`${record.sourceId}:${record.newsId}`}>
      {safeLink(record.url) ? <a href={safeLink(record.url)!} target="_blank" rel="noreferrer">{record.label}<ExternalLink size={10} /></a> : <span>{record.label}</span>}
      <span><time dateTime={record.publishedAt}>{formatFull(record.publishedAt)}</time>{onSource ? <button type="button" className="news-evidence-source" onClick={() => onSource(record.sourceId)}>来源目录<ArrowUpRight size={10} /></button> : null}</span>
    </li>)}</ol></details> : null}
    {p.relatedNewsId ? <button type="button" className="economic-map-related" onClick={() => onNews(p.relatedNewsId!)}>查看关联通报</button> : null}
    <div className="economic-detail-bottom"><span>时间均为北京时间</span>{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">{p.evidenceLinks?.length ? "最新通报原文" : "查看来源"}<ExternalLink size={12} /></a> : null}</div>
  </section>;
}
