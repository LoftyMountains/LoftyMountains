import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, CircleAlert, LoaderCircle, Newspaper, PanelRightClose } from "lucide-react";
import type { AnalysisLink, NewsItem } from "../../shared/types";
import { apiUrl } from "../lib/api";
import { confidenceLabels, relationshipLabels, sourceLabels } from "../lib/relationships";
import { formatFull } from "../lib/time";

export interface SelectedRelationshipEvidence {
  link: AnalysisLink;
  counterpartLabel: string;
}

export interface RelatedNewsSelection {
  type: "topic" | "stock";
  value: string;
  label: string;
  relationships?: SelectedRelationshipEvidence[];
}

interface RelatedNewsPanelProps {
  selection: RelatedNewsSelection | null;
  from: string | null;
  to: string | null;
  collapsed: boolean;
  peeking: boolean;
  onCollapse: () => void;
}

interface RelatedNewsCacheEntry {
  items: NewsItem[];
  storedAt: number;
}

const relatedNewsCache = new Map<string, RelatedNewsCacheEntry>();
const relatedNewsRequests = new Map<string, Promise<NewsItem[]>>();
const relatedNewsCacheTtlMs = 10 * 60_000;
const relatedNewsCacheLimit = 80;

function readRelatedNewsCache(key: string) {
  const cached = relatedNewsCache.get(key);
  if (!cached || Date.now() - cached.storedAt > relatedNewsCacheTtlMs) {
    if (cached) relatedNewsCache.delete(key);
    return null;
  }
  relatedNewsCache.delete(key);
  relatedNewsCache.set(key, cached);
  return cached.items;
}

function loadRelatedNews(key: string, url: string) {
  const pending = relatedNewsRequests.get(key);
  if (pending) return pending;
  const request = fetch(url)
    .then(async (response) => {
      if (!response.ok) throw new Error("相关快讯加载失败");
      const payload = await response.json() as { items: NewsItem[] };
      if (relatedNewsCache.size >= relatedNewsCacheLimit && !relatedNewsCache.has(key)) {
        const oldest = relatedNewsCache.keys().next().value as string | undefined;
        if (oldest) relatedNewsCache.delete(oldest);
      }
      relatedNewsCache.set(key, { items: payload.items, storedAt: Date.now() });
      return payload.items;
    })
    .finally(() => relatedNewsRequests.delete(key));
  relatedNewsRequests.set(key, request);
  return request;
}

export function RelatedNewsPanel({ selection, from, to, collapsed, peeking, onCollapse }: RelatedNewsPanelProps) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"news" | "evidence">("news");

  useEffect(() => setView("news"), [selection?.type, selection?.value]);

  useEffect(() => {
    if (!selection || !from || !to) {
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }
    const params = new URLSearchParams({ from, to, type: selection.type, value: selection.value });
    const key = params.toString();
    const cached = readRelatedNewsCache(key);
    if (cached) {
      setItems(cached);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    setItems([]);
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      void loadRelatedNews(key, `${apiUrl("/api/analysis/news")}?${params}`)
        .then((loadedItems) => {
          if (active) setItems(loadedItems);
        })
        .catch((reason: unknown) => {
          if (!active) return;
          setError(reason instanceof Error ? reason.message : "相关快讯加载失败");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 60);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [from, selection, to]);

  const relationships = selection?.relationships || [];
  const evidenceCount = new Set(relationships.flatMap((relationship) =>
    (relationship.link.evidence || []).map((evidence) => evidence.eventId)
  )).size;
  const evidencePreview = useMemo(() => {
    const seen = new Set<string>();
    return relationships
      .flatMap((relationship) => relationship.link.evidence || [])
      .filter((evidence) => !seen.has(evidence.eventId) && Boolean(seen.add(evidence.eventId)))
      .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
      .slice(0, 8);
  }, [relationships]);

  return (
    <section id="related-news-shell" className={`insight-news-panel ${selection?.type === "stock" ? "has-tabs" : ""} ${collapsed ? "is-collapsed" : ""} ${peeking ? "is-auto-peek" : ""}`} aria-labelledby="related-news-title" aria-live="polite" aria-hidden={collapsed || undefined}>
      <header>
        <div className="insight-panel-title">
          <Newspaper size={15} />
          <div>
            <span>相关快讯</span>
            <h2 id="related-news-title">{selection?.label || "市场情报"}</h2>
          </div>
        </div>
        <div className="insight-panel-actions">
          <strong>{selection ? (loading ? "检索中" : `${items.length} 条`) : "待命"}</strong>
          <button id="related-news-collapse" type="button" className="insight-panel-collapse" onClick={onCollapse} aria-controls="related-news-shell" aria-expanded="true" title="折叠相关新闻" aria-label="折叠相关新闻"><PanelRightClose size={15} /></button>
        </div>
      </header>

      {selection?.type === "stock" ? (
        <div className="related-view-tabs" role="tablist" aria-label="股票关联信息视图">
          <button type="button" id="related-news-tab" role="tab" aria-controls="related-news-panel" aria-selected={view === "news"} className={view === "news" ? "is-active" : ""} onClick={() => setView("news")}>相关新闻</button>
          <button type="button" id="relationship-evidence-tab" role="tab" aria-controls="relationship-evidence-panel" aria-selected={view === "evidence"} className={view === "evidence" ? "is-active" : ""} onClick={() => setView("evidence")}>关系证据 {evidenceCount}</button>
        </div>
      ) : null}

      {!selection ? <div className="insight-panel-empty"><Newspaper size={22} /><span>市场情报待命</span></div> : null}
      {selection && view === "news" ? (
        <div id="related-news-panel" className="related-news-list" role={selection.type === "stock" ? "tabpanel" : undefined} aria-labelledby={selection.type === "stock" ? "related-news-tab" : undefined} aria-busy={loading}>
          {loading && !evidencePreview.length ? <div className="related-news-state"><LoaderCircle className="is-spinning" size={20} /><span>正在汇总相关快讯</span></div> : null}
          {loading && evidencePreview.length ? evidencePreview.map((evidence) => (
            <article className={`related-news-item is-evidence-preview source-${evidence.sources[0] || "unknown"}`} key={evidence.eventId}>
              <i className="related-news-source-mark" />
              <div>
                <div className="related-news-meta">
                  <span>{evidence.sources.map((source) => sourceLabels[source]).join(" · ")}</span>
                  <time dateTime={evidence.publishedAt}>{formatFull(evidence.publishedAt)}</time>
                </div>
                <h3>{evidence.title}</h3>
              </div>
            </article>
          )) : null}
          {error ? <div className="related-news-state is-error"><CircleAlert size={20} /><span>{error}</span></div> : null}
          {!loading && !error && !items.length ? <div className="related-news-state"><CircleAlert size={20} /><span>当前周期没有相关快讯</span></div> : null}
          {!loading && !error ? items.map((item) => (
            <article className={`related-news-item source-${item.source}`} key={item.id}>
              <i className="related-news-source-mark" />
              <div>
                <div className="related-news-meta">
                  <span>{item.sourceLabel}</span>
                  <time dateTime={item.publishedAt}>{formatFull(item.publishedAt)}</time>
                  {item.important ? <b>重要</b> : null}
                </div>
                <h3>{item.title}</h3>
              </div>
              {item.url ? (
                <a href={item.url} target="_blank" rel="noreferrer" title="查看原文" aria-label={`查看${item.sourceLabel}原文`}>
                  <ArrowUpRight size={14} />
                </a>
              ) : null}
            </article>
          )) : null}
        </div>
      ) : null}

      {selection && view === "evidence" ? (
        <div id="relationship-evidence-panel" className="relationship-evidence-list" role="tabpanel" aria-labelledby="relationship-evidence-tab">
          {!relationships.length ? <div className="related-news-state"><CircleAlert size={20} /><span>当前筛选条件下没有关系证据</span></div> : null}
          {relationships.map(({ link, counterpartLabel }) => (
            <article className="relationship-evidence-item" key={`${link.type}:${link.source}:${link.target}`}>
              <header>
                <strong>{counterpartLabel}</strong>
                <span>{relationshipLabels[link.type]} · {confidenceLabels[link.confidence]}</span>
              </header>
              <div className="relationship-evidence-metrics">
                <span>共同事件 {link.cooccurrenceCount}</span>
                <span>NPMI {link.npmi.toFixed(2)}</span>
              </div>
              <div className="relationship-evidence-headlines">
                {!link.evidence?.length ? <p className="relationship-evidence-unavailable">证据标题暂不可用</p> : null}
                {(link.evidence || []).map((evidence) => (
                  <div key={evidence.eventId}>
                    <time dateTime={evidence.publishedAt}>{formatFull(evidence.publishedAt)}</time>
                    <p>{evidence.title}</p>
                    <span>{evidence.sources.map((source) => sourceLabels[source]).join(" · ")}</span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
