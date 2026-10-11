import { ArrowUpRight, ExternalLink, FileText, GitBranch } from "lucide-react";
import type { EconomicNewsItem, NewsEvidence } from "../../shared/types";
import { formatFull } from "../lib/time";

export const evidenceLabels: Record<NewsEvidence["kind"], string> = { "primary-release": "Primary releases", "media-report": "Media reports", "aggregated-event": "Event compilations" };
function safeLink(value: string | null) { try { const url = new URL(value || ""); return ["http:", "https:"].includes(url.protocol) ? url.href : null; } catch { return null; } }
export function NewsEvidenceDetail({ item, onSource }: { item: EconomicNewsItem; onSource: (id: string) => void }) {
  const evidence = item.evidence;
  if (!evidence) return <section className="news-evidence" aria-label="Record provenance"><h3><GitBranch size={13} />Record provenance</h3><p>A complete transformation record is not available. See the source catalog and original record.</p><button type="button" className="news-evidence-source" onClick={() => onSource(item.source)}>{item.sourceLabel} · Source catalog<ArrowUpRight size={12} /></button></section>;
  const originalUrl = safeLink(evidence.originalUrl);
  const regions = evidence.entities.filter(entity => entity.type === "region");
  const securities = evidence.entities.filter(entity => entity.type === "security");
  return <section className="news-evidence" aria-label="Record provenance"><h3><GitBranch size={13} />Record provenance<span>{evidenceLabels[evidence.kind]}</span></h3>
    <ol className="news-evidence-chain">
      <li><span className="news-evidence-step">1</span><div><strong>Source</strong><button type="button" className="news-evidence-source" onClick={() => onSource(evidence.sourceId)}>{item.sourceLabel}<ArrowUpRight size={12} /><span className="sr-only">View source catalog</span></button></div></li>
      <li><span className="news-evidence-step">2</span><div><strong>Original record</strong><dl><div><dt>{evidence.timeKind === "published" ? "Source publication time" : evidence.timeKind === "observation" ? "Source observation time" : "Source record time"}</dt><dd>{formatFull(evidence.publishedAt)}</dd></div><div><dt>Last retrieved</dt><dd>{evidence.lastRetrievedAt ? formatFull(evidence.lastRetrievedAt) : "No retrieval time"}</dd></div></dl><p className="news-evidence-record"><FileText size={11} />Record ID <code>{evidence.recordId}</code></p>{originalUrl ? <a className="news-evidence-source" href={originalUrl} target="_blank" rel="noreferrer">Original record link<ExternalLink size={11} /></a> : null}</div></li>
      <li><span className="news-evidence-step">3</span><div><strong>Normalization and extraction</strong><p>{evidence.transformations.length ? evidence.transformations.map(step => step.label).join(" → ") : "No transformation steps provided"}</p></div></li>
      <li><span className="news-evidence-step">4</span><div><strong>Topics and location clues</strong>{regions.length ? <div className="news-evidence-entities">{regions.map(entity => <p key={entity.id}><b>{entity.label}</b><span>Matched mentions: {entity.matchedTerms.join(", ") || "No matched terms provided"}</span></p>)}</div> : <p>No clear region was identified. The record remains in the news feed.</p>}{securities.length ? <div className="news-evidence-entities">{securities.map(entity => <p key={entity.id}><b>{entity.label}</b><span>Publisher security tags</span></p>)}</div> : null}<p className="news-evidence-caution">Topics and regions are extracted using rules; security tags come from the publisher. These associations do not establish verified locations, causation or market impact.</p></div></li>
    </ol><small>All times UTC+8. Records from different sources are retained separately; matching headlines are not independent corroboration.</small>
  </section>;
}
