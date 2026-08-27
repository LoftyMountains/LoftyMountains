import { useState } from "react";
import { ArrowUpRight, CalendarSearch, CircleAlert, ListFilter, Radio, RotateCcw, Search, X } from "lucide-react";
import type { NewsItem, SourceId, SourceStatus } from "../../shared/types";
import { formatClock, formatDay, relativeTime } from "../lib/time";

export type ViewMode = "live" | "history" | "replay";

interface NewsFeedProps {
  items: NewsItem[];
  mode: ViewMode;
  sources: SourceStatus[];
  selectedSources: Set<SourceId>;
  now: number;
  loading: boolean;
  replayTime?: string;
  onModeLive: () => void;
  onToggleSource: (source: SourceId) => void;
  onClearSources: () => void;
  onOpenQuery: () => void;
}

export function NewsFeed({ items, mode, sources, selectedSources, now, loading, replayTime, onModeLive, onToggleSource, onClearSources, onOpenQuery }: NewsFeedProps) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  return (
    <section className="news-column" aria-label="实时财经快讯">
      <div className="section-heading news-heading">
        <div>
          <div className="eyebrow">INTELLIGENCE STREAM</div>
          <h1>{mode === "live" ? "实时快讯" : mode === "replay" ? "历史回放" : "时间检索"}</h1>
        </div>
        <div className="heading-actions">
          {mode !== "live" ? (
            <button className="text-button" onClick={onModeLive}><RotateCcw size={15} />返回实时</button>
          ) : null}
          <button className="icon-button" onClick={onOpenQuery} title="时间查询与回放" aria-label="时间查询与回放">
            <CalendarSearch size={18} />
          </button>
        </div>
      </div>

      <div className="source-filter" aria-label="消息来源筛选">
        <button type="button" className="source-filter-mobile-toggle" aria-expanded={sourcesOpen} aria-controls="source-filter-sheet" onClick={() => setSourcesOpen(true)}>
          <ListFilter size={16} />来源
          <span>{selectedSources.size ? `${selectedSources.size} 个` : `全部 ${sources.length}`}</span>
        </button>
        {sources.map((source) => {
          const active = selectedSources.size === 0 || selectedSources.has(source.id);
          return (
            <button
              key={source.id}
              className={`source-filter-button source-${source.id} ${active ? "is-active" : ""}`}
              onClick={() => onToggleSource(source.id)}
              title={source.message || `${source.label} ${source.state}`}
              aria-pressed={active}
            >
              <i />{source.label}
            </button>
          );
        })}
      </div>
      <div id="source-filter-sheet" className={`source-filter-sheet ${sourcesOpen ? "is-open" : ""}`} role={sourcesOpen ? "dialog" : undefined} aria-modal={sourcesOpen || undefined} aria-label="选择快讯来源">
        <header><div><strong>快讯来源</strong><span>{selectedSources.size ? `已选择 ${selectedSources.size} 个` : "显示全部来源"}</span></div><button type="button" onClick={() => setSourcesOpen(false)} aria-label="关闭来源筛选"><X size={18} /></button></header>
        <div>
          <button type="button" className={!selectedSources.size ? "is-active" : ""} aria-pressed={!selectedSources.size} onClick={onClearSources}><i className="is-all" />全部来源</button>
          {sources.map((source) => {
            const active = selectedSources.size === 0 || selectedSources.has(source.id);
            return <button type="button" className={`source-${source.id} ${active ? "is-active" : ""}`} aria-pressed={active} onClick={() => onToggleSource(source.id)} key={source.id}><i />{source.label}<span className={`status-dot is-${source.state}`} /></button>;
          })}
        </div>
        <button type="button" className="source-filter-sheet-done" onClick={() => setSourcesOpen(false)}>完成</button>
      </div>

      <div className="feed-context">
        <span>{mode === "live" ? <><Radio size={13} /> 实时滚动</> : mode === "replay" ? <><span className="replay-pulse" /> {replayTime ? formatClock(replayTime) : "待播放"}</> : <><Search size={13} /> 查询结果</>}</span>
        <span>{items.length} 条</span>
      </div>

      <div className="news-list" role="feed" aria-busy={loading}>
        {loading && !items.length ? <NewsSkeleton /> : null}
        {!loading && !items.length ? (
          <div className="empty-state">
            <CircleAlert size={22} />
            <strong>当前时间范围暂无消息</strong>
            <span>调整时间或来源后再次查询</span>
          </div>
        ) : null}
        {items.map((item, index) => (
          <article className={`news-item source-${item.source} ${index === 0 && mode === "live" ? "is-new" : ""}`} key={item.id}>
            <div className="timeline-rail"><i /></div>
            <div className="news-time">
              <time dateTime={item.publishedAt}>{formatClock(item.publishedAt).slice(0, 5)}</time>
              <span>{relativeTime(item.publishedAt, now)}</span>
            </div>
            <div className="news-body">
              <div className="news-meta">
                <span className="news-source">{item.sourceLabel}</span>
                {item.important ? <span className="important-label">重要</span> : null}
                {formatDay(item.publishedAt) !== formatDay(now) ? <span>{formatDay(item.publishedAt)}</span> : null}
              </div>
              <h2>{item.title}</h2>
              {item.content !== item.title ? <p>{item.content}</p> : null}
              {item.tags.length ? <div className="news-tags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
            </div>
            {item.url ? (
              <a className="source-link" href={item.url} target="_blank" rel="noreferrer" title="查看原文" aria-label={`查看${item.sourceLabel}原文`}>
                <ArrowUpRight size={16} />
              </a>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function NewsSkeleton() {
  return <>{Array.from({ length: 6 }, (_, index) => (
    <div className="news-skeleton" key={index}>
      <span /><div><i /><i /></div>
    </div>
  ))}</>;
}
