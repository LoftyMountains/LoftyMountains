import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, CircleAlert, LoaderCircle, X } from "lucide-react";
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
  anchor: { x: number; y: number };
  relationships?: SelectedRelationshipEvidence[];
}

interface RelatedNewsDialogProps {
  selection: RelatedNewsSelection;
  from: string;
  to: string;
  onClose: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

export function RelatedNewsDialog({ selection, from, to, onClose, onPointerEnter, onPointerLeave }: RelatedNewsDialogProps) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"news" | "evidence">("news");

  useEffect(() => setView("news"), [selection.type, selection.value]);

  useEffect(() => {
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
  }, [from, selection.type, selection.value, to]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const position = useMemo(() => {
    const width = Math.min(540, Math.max(296, window.innerWidth - 24));
    const height = Math.min(768, window.innerHeight - 24);
    const preferredLeft = selection.anchor.x + 14;
    const left = Math.max(12, preferredLeft + width <= window.innerWidth - 12
      ? preferredLeft
      : selection.anchor.x - width - 14);
    const top = Math.max(12, Math.min(selection.anchor.y - 28, window.innerHeight - height - 12));
    return { left, top, width };
  }, [selection.anchor.x, selection.anchor.y]);
  const relationships = selection.relationships || [];
  const evidenceCount = new Set(relationships.flatMap((relationship) =>
    (relationship.link.evidence || []).map((evidence) => evidence.eventId)
  )).size;

  return (
    <div className="related-news-layer" role="presentation">
      <section
        className={`related-news-dialog ${selection.type === "stock" ? "has-tabs" : ""}`}
        role="dialog"
        aria-labelledby="related-news-title"
        style={position}
        onPointerEnter={onPointerEnter}
        onPointerDown={onPointerEnter}
        onPointerLeave={onPointerLeave}
      >
        <header>
          <div>
            <span className="eyebrow">RELATED INTELLIGENCE</span>
            <h2 id="related-news-title">{selection.label}</h2>
            <p>{view === "evidence" ? `关系证据 · ${evidenceCount} 条标题` : `${selection.type === "stock" ? "关联股票快讯" : "热点主题快讯"} · ${loading ? "正在检索" : `${items.length} 条结果`}`}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title="关闭" aria-label="关闭相关快讯"><X size={18} /></button>
        </header>

        {selection.type === "stock" ? (
          <div className="related-view-tabs" role="tablist" aria-label="股票关联信息视图">
            <button type="button" id="related-news-tab" role="tab" aria-controls="related-news-panel" aria-selected={view === "news"} className={view === "news" ? "is-active" : ""} onClick={() => setView("news")}>相关新闻</button>
            <button type="button" id="relationship-evidence-tab" role="tab" aria-controls="relationship-evidence-panel" aria-selected={view === "evidence"} className={view === "evidence" ? "is-active" : ""} onClick={() => setView("evidence")}>关系证据</button>
          </div>
        ) : null}

        {view === "news" ? <div id="related-news-panel" className="related-news-list" role={selection.type === "stock" ? "tabpanel" : undefined} aria-labelledby={selection.type === "stock" ? "related-news-tab" : undefined} aria-busy={loading}>
          {loading ? <div className="related-news-state"><LoaderCircle className="is-spinning" size={22} /><span>正在汇总相关快讯</span></div> : null}
          {error ? <div className="related-news-state is-error"><CircleAlert size={22} /><span>{error}</span></div> : null}
          {!loading && !error && !items.length ? <div className="related-news-state"><CircleAlert size={22} /><span>当前周期内没有找到相关快讯</span></div> : null}
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
                {item.content !== item.title ? <p>{item.content}</p> : null}
              </div>
              {item.url ? (
                <a href={item.url} target="_blank" rel="noreferrer" title="查看原文" aria-label={`查看${item.sourceLabel}原文`}>
                  <ArrowUpRight size={16} />
                </a>
              ) : null}
            </article>
          )) : null}
        </div> : (
          <div id="relationship-evidence-panel" className="relationship-evidence-list" role="tabpanel" aria-labelledby="relationship-evidence-tab">
            {!relationships.length ? <div className="related-news-state"><CircleAlert size={22} /><span>当前筛选条件下没有关系证据</span></div> : null}
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
        )}
      </section>
    </div>
  );
}
