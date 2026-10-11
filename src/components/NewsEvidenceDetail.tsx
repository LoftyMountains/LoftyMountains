import { ArrowUpRight, ExternalLink, FileText, GitBranch } from "lucide-react";
import type { EconomicNewsItem, NewsEvidence } from "../../shared/types";
import { formatFull } from "../lib/time";

export const evidenceLabels: Record<NewsEvidence["kind"], string> = { "primary-release": "机构原文", "media-report": "媒体报道", "aggregated-event": "事件汇编" };
function safeLink(value: string | null) { try { const url = new URL(value || ""); return ["http:", "https:"].includes(url.protocol) ? url.href : null; } catch { return null; } }
export function NewsEvidenceDetail({ item, onSource }: { item: EconomicNewsItem; onSource: (id: string) => void }) {
  const evidence = item.evidence;
  if (!evidence) return <section className="news-evidence" aria-label="记录溯源"><h3><GitBranch size={13} />记录溯源</h3><p>这条消息暂未附带完整转换记录，可查看来源目录与原文。</p><button type="button" className="news-evidence-source" onClick={() => onSource(item.source)}>{item.sourceLabel} · 来源目录<ArrowUpRight size={12} /></button></section>;
  const originalUrl = safeLink(evidence.originalUrl);
  const regions = evidence.entities.filter(entity => entity.type === "region");
  const securities = evidence.entities.filter(entity => entity.type === "security");
  return <section className="news-evidence" aria-label="记录溯源"><h3><GitBranch size={13} />记录溯源<span>{evidenceLabels[evidence.kind]}</span></h3>
    <ol className="news-evidence-chain">
      <li><span className="news-evidence-step">1</span><div><strong>来源</strong><button type="button" className="news-evidence-source" onClick={() => onSource(evidence.sourceId)}>{item.sourceLabel}<ArrowUpRight size={12} /><span className="sr-only">查看来源目录</span></button></div></li>
      <li><span className="news-evidence-step">2</span><div><strong>原始记录</strong><dl><div><dt>{evidence.timeKind === "published" ? "来源发布时间" : evidence.timeKind === "observation" ? "来源观测时间" : "来源记录时间"}</dt><dd>{formatFull(evidence.publishedAt)}</dd></div><div><dt>最近采集时间</dt><dd>{evidence.lastRetrievedAt ? formatFull(evidence.lastRetrievedAt) : "暂无采集时间"}</dd></div></dl><p className="news-evidence-record"><FileText size={11} />记录标识 <code>{evidence.recordId}</code></p>{originalUrl ? <a className="news-evidence-source" href={originalUrl} target="_blank" rel="noreferrer">原始记录链接<ExternalLink size={11} /></a> : null}</div></li>
      <li><span className="news-evidence-step">3</span><div><strong>规范化与提取</strong><p>{evidence.transformations.length ? evidence.transformations.map(step => step.label).join(" → ") : "当前记录未提供转换步骤"}</p></div></li>
      <li><span className="news-evidence-step">4</span><div><strong>主题与地区线索</strong>{regions.length ? <div className="news-evidence-entities">{regions.map(entity => <p key={entity.id}><b>{entity.label}</b><span>规则匹配提及：{entity.matchedTerms.join("、") || "未提供匹配词"}</span></p>)}</div> : <p>未提取明确地区，消息仍保留在快讯中。</p>}{securities.length ? <div className="news-evidence-entities">{securities.map(entity => <p key={entity.id}><b>{entity.label}</b><span>发布方证券标签</span></p>)}</div> : null}<p className="news-evidence-caution">主题和地区由规则提取；证券标签沿用发布方信息。这些关联不代表已核验的事件位置、因果关系或市场影响。</p></div></li>
    </ol><small>时间均为北京时间。同标题的不同来源记录分别保留，不等于独立互证。</small>
  </section>;
}
