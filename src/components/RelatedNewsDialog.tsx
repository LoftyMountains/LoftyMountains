import { useEffect, useState } from "react";
import { ArrowUpRight, CircleAlert, LoaderCircle, Newspaper } from "lucide-react";
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
}

export function RelatedNewsPanel({ selection, from, to }: RelatedNewsPanelProps) {
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
    const controller = new AbortController();
    const params = new URLSearchParams({ from, to, type: selection.type, value: selection.value });
    setItems([]);
    setLoading(true);
    setError(null);
    void fetch(`${apiUrl("/api/analysis/news")}?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("相关快讯加载失败");
        const payload = await response.json() as { items: NewsItem[] };
        setItems(payload.items);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "相关快讯加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [from, selection, to]);

  const relationships = selection?.relationships || [];
  const evidenceCount = new Set(relationships.flatMap((relationship) =>
    (relationship.link.evidence || []).map((evidence) => evidence.eventId)
  )).size;

  return (
    <section className={`insight-news-panel ${selection?.type === "stock" ? "has-tabs" : ""}`} aria-labelledby="related-news-title" aria-live="polite">
      <header>
        <div className="insight-panel-title">
          <Newspaper size={15} />
          <div>
            <span>相关快讯</span>
            <h2 id="related-news-title">{selection?.label || "市场情报"}</h2>
          </div>
        </div>
        <strong>{selection ? (loading ? "检索中" : `${items.length} 条`) : "待命"}</strong>
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
          {loading ? <div className="related-news-state"><LoaderCircle className="is-spinning" size={20} /><span>正在汇总相关快讯</span></div> : null}
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
