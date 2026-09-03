import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, CalendarSearch, ChevronDown, CircleAlert, Info, ListFilter, Radio, RotateCcw, Search, X } from "lucide-react";
import type { FeedNewsItem, SourceId, SourceStatus } from "../../shared/types";
import { newsLinkAccess, shouldShowNewsContent, stableEventDomToken, type NewsEventGroup } from "../lib/news-events";
import type { NewsQueryCompleteness } from "../lib/news-query";
import { formatClock, formatDay, relativeTime } from "../lib/time";

export type ViewMode = "live" | "history" | "replay";
export type FeedViewMode = "events" | "all";

interface NewsFeedProps {
  items: FeedNewsItem[];
  events: NewsEventGroup[];
  feedView: FeedViewMode;
  mode: ViewMode;
  sources: SourceStatus[];
  selectedSources: Set<SourceId>;
  now: number;
  replayCursorMs?: number;
  replayPlaying?: boolean;
  replayEnded?: boolean;
  loading: boolean;
  error: string | null;
  replayTime?: string;
  historyCompleteness: NewsQueryCompleteness | null;
  historyCompletenessRevision: number;
  historyReturnedCount: number;
  onModeLive: () => void;
  onFeedViewChange: (mode: FeedViewMode) => void;
  onToggleSource: (source: SourceId) => void;
  onClearSources: () => void;
  onOpenQuery: () => void;
}

const groupingExplanation = "按时间、标题、主题与相关标的归并，可能存在误差；展开可查看当前列表中归入本组的报道。";

export function NewsFeed({
  items,
  events,
  feedView,
  mode,
  sources,
  selectedSources,
  now,
  replayCursorMs,
  replayPlaying = false,
  replayEnded = false,
  loading,
  error,
  replayTime,
  historyCompleteness,
  historyCompletenessRevision,
  historyReturnedCount,
  onModeLive,
  onFeedViewChange,
  onToggleSource,
  onClearSources,
  onOpenQuery,
}: NewsFeedProps) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [groupingInfoOpen, setGroupingInfoOpen] = useState(false);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const sourceToggleRef = useRef<HTMLButtonElement>(null);
  const sourceCloseRef = useRef<HTMLButtonElement>(null);
  const sourceDialogRef = useRef<HTMLDivElement>(null);
  const groupingInfoTriggerRef = useRef<HTMLButtonElement>(null);
  const groupingInfoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sourcesOpen) return;
    const appShell = document.querySelector<HTMLElement>(".app-shell");
    const hadInert = appShell?.hasAttribute("inert") || false;
    const previousAriaHidden = appShell?.getAttribute("aria-hidden") ?? null;
    appShell?.setAttribute("inert", "");
    appShell?.setAttribute("aria-hidden", "true");
    sourceCloseRef.current?.focus();

    const containFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSources();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = sourceDialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])"))
        .filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", containFocus);
    return () => {
      window.removeEventListener("keydown", containFocus);
      if (!hadInert) appShell?.removeAttribute("inert");
      if (previousAriaHidden === null) appShell?.removeAttribute("aria-hidden");
      else appShell?.setAttribute("aria-hidden", previousAriaHidden);
    };
  }, [sourcesOpen]);

  useEffect(() => {
    if (!groupingInfoOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (groupingInfoTriggerRef.current?.contains(target) || groupingInfoRef.current?.contains(target)) return;
      setGroupingInfoOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setGroupingInfoOpen(false);
      groupingInfoTriggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [groupingInfoOpen]);

  function closeSources() {
    setSourcesOpen(false);
    window.requestAnimationFrame(() => sourceToggleRef.current?.focus());
  }

  function openSources() {
    setGroupingInfoOpen(false);
    setSourcesOpen(true);
  }

  const toggleEvent = (key: string) => {
    setExpandedEvents((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const countText = feedView === "events"
    ? `${events.length} 个事件 · ${items.length} 条报道`
    : `${items.length} 条报道`;
  const showHistoryIntegrity = mode === "history" && historyCompleteness && historyCompleteness.status !== "complete";
  const showFilteredEmpty = mode === "history" && historyReturnedCount > 0 && items.length === 0;
  const showEmptyResult = mode !== "history" || historyCompleteness?.status === "complete";
  const contentNow = mode === "replay" && replayCursorMs !== undefined ? replayCursorMs : now;

  return (<>
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
          <button className="icon-button" data-query-focus-return="primary" onClick={onOpenQuery} title="时间查询与回放" aria-label="时间查询与回放">
            <CalendarSearch size={18} />
          </button>
        </div>
      </div>

      <div className="source-filter" aria-label="快讯显示选项">
        <div className="feed-view-controls">
          <div className="feed-view-switch" role="group" aria-label="快讯视图">
            <button type="button" className={feedView === "events" ? "is-active" : ""} aria-pressed={feedView === "events"} onClick={() => onFeedViewChange("events")}>事件</button>
            <button type="button" className={feedView === "all" ? "is-active" : ""} aria-pressed={feedView === "all"} onClick={() => onFeedViewChange("all")}>全部</button>
          </div>
          <button
            ref={groupingInfoTriggerRef}
            type="button"
            className="feed-view-info"
            aria-label="了解事件归并方式"
            aria-expanded={groupingInfoOpen}
            aria-controls="news-grouping-explanation"
            aria-describedby={groupingInfoOpen ? "news-grouping-explanation" : undefined}
            onClick={() => setGroupingInfoOpen((current) => !current)}
          ><Info size={15} /></button>
          {groupingInfoOpen ? (
            <div ref={groupingInfoRef} id="news-grouping-explanation" className="feed-view-popover" role="tooltip">
              {groupingExplanation}
            </div>
          ) : null}
        </div>
        <div className="source-filter-list" aria-label="消息来源筛选">
          <button ref={sourceToggleRef} type="button" className="source-filter-mobile-toggle" aria-expanded={sourcesOpen} aria-controls="source-filter-sheet" onClick={openSources}>
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
      </div>

      <div className="feed-context">
        <span className={mode === "replay" ? `replay-context is-${replayPlaying ? "playing" : replayEnded ? "ended" : "paused"}` : undefined}>{mode === "live" ? <><Radio size={13} /> 实时滚动</> : mode === "replay" ? <><span className="replay-pulse" /><span className="replay-state-label">{replayPlaying ? "播放中" : replayEnded ? "已结束" : "已暂停"}</span> {replayTime ? formatClock(replayTime) : "待播放"}</> : <><Search size={13} /> 查询结果</>}</span>
        <span className="feed-count" aria-live={mode === "replay" ? undefined : "polite"} aria-atomic="true">{countText}</span>
      </div>

      {showHistoryIntegrity ? (
        <HistoryIntegrityNotice
          completeness={historyCompleteness}
          revision={historyCompletenessRevision}
          onOpenQuery={onOpenQuery}
        />
      ) : null}

      <div className="news-list" role="feed" aria-busy={loading}>
        {loading && !items.length ? <NewsSkeleton /> : null}
        {!loading && error && !items.length ? <FeedState title="快讯加载失败" detail={error} /> : null}
        {!loading && !error && showFilteredEmpty ? <FeedState title="当前来源筛选暂无消息" detail="调整来源筛选后查看这批查询结果" /> : null}
        {!loading && !error && mode === "replay" && !items.length ? <FeedState title="等待该时刻的消息" detail="本次回放中的消息尚未到达当前时间，或当前来源筛选无匹配" /> : null}
        {!loading && !error && mode !== "replay" && !showFilteredEmpty && !items.length && showEmptyResult ? <FeedState title="当前时间范围暂无消息" detail="调整时间或来源后再次查询" /> : null}
        {feedView === "all" ? items.map((item, index) => (
          <NewsArticle item={item} now={contentNow} isNew={index === 0 && mode === "live"} key={item.id} />
        )) : events.map((event, index) => event.itemCount === 1 ? (
          <NewsArticle item={event.representative} now={contentNow} isNew={index === 0 && mode === "live"} key={event.key} />
        ) : (
          <EventArticle
            event={event}
            now={contentNow}
            expanded={expandedEvents.has(event.key)}
            isNew={index === 0 && mode === "live"}
            onToggle={() => toggleEvent(event.key)}
            key={event.key}
          />
        ))}
      </div>
    </section>
    {sourcesOpen ? createPortal(
      <div className="source-filter-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeSources()}>
        <div ref={sourceDialogRef} id="source-filter-sheet" className="source-filter-sheet" role="dialog" aria-modal="true" aria-labelledby="source-filter-title" tabIndex={-1}>
          <header><div><strong id="source-filter-title">快讯来源</strong><span>{selectedSources.size ? `已选择 ${selectedSources.size} 个` : "显示全部来源"}</span></div><button ref={sourceCloseRef} type="button" onClick={closeSources} aria-label="关闭来源筛选"><X size={18} /></button></header>
          <div>
            <button type="button" className={!selectedSources.size ? "is-active" : ""} aria-pressed={!selectedSources.size} onClick={onClearSources}><i className="is-all" />全部来源</button>
            {sources.map((source) => {
              const active = selectedSources.size === 0 || selectedSources.has(source.id);
              return <button type="button" className={`source-${source.id} ${active ? "is-active" : ""}`} aria-pressed={active} onClick={() => onToggleSource(source.id)} key={source.id}><i />{source.label}<span className={`status-dot is-${source.state}`} /></button>;
            })}
          </div>
          <button type="button" className="source-filter-sheet-done" onClick={closeSources}>完成</button>
        </div>
      </div>,
      document.body,
    ) : null}
  </>);
}

function HistoryIntegrityNotice({
  completeness,
  revision,
  onOpenQuery,
}: {
  completeness: Exclude<NewsQueryCompleteness, { status: "complete" }>;
  revision: number;
  onOpenQuery: () => void;
}) {
  const truncated = completeness.status === "truncated";
  const limit = truncated ? new Intl.NumberFormat("zh-CN").format(completeness.limit) : null;
  return (
    <div className={`history-integrity is-${completeness.status}`} role="status" aria-live="polite" aria-atomic="true" key={revision}>
      <CircleAlert size={18} aria-hidden="true" />
      <div>
        <strong>{truncated ? "结果已截断" : "本次结果完整性未知"}</strong>
        <span>{truncated
          ? `仅显示当前已获取结果中最新 ${limit} 条，较早匹配项未展示。来源筛选只作用于这批结果。`
          : "服务端未提供可信的结果边界，请缩短时间范围后重试。来源筛选只作用于当前这批结果。"}</span>
      </div>
      <button type="button" data-query-focus-return="integrity" onClick={onOpenQuery}><CalendarSearch size={16} />调整查询</button>
    </div>
  );
}

function NewsArticle({ item, now, isNew }: { item: FeedNewsItem; now: number; isNew: boolean }) {
  return (
    <article className={`news-item source-${item.source} ${isNew ? "is-new" : ""}`} aria-label={`${item.sourceLabel}：${item.title}`}>
      <TimelineRail />
      <NewsTime publishedAt={item.publishedAt} now={now} />
      <div className="news-body">
        <NewsMeta item={item} now={now} />
        <h2>{item.title}</h2>
        {shouldShowNewsContent(item.title, item.content) ? <p>{item.content}</p> : null}
        <NewsTags tags={item.tags} />
      </div>
      <NewsSourceAccess item={item} />
    </article>
  );
}

function EventArticle({ event, now, expanded, isNew, onToggle }: { event: NewsEventGroup; now: number; expanded: boolean; isNew: boolean; onToggle: () => void }) {
  const item = event.representative;
  const detailsId = `news-event-details-${stableEventDomToken(event.key)}`;
  const disclosureLabel = `${expanded ? "收起" : "展开"}${item.title}的 ${event.itemCount} 条原始报道`;
  return (
    <article className={`news-item news-event source-${item.source} ${expanded ? "is-expanded" : "is-collapsed"} ${isNew ? "is-new" : ""}`} aria-label={`事件：${item.title}，${event.sourceCount} 家来源，${event.itemCount} 条报道`}>
      <TimelineRail />
      <NewsTime publishedAt={event.latestAt} now={now} />
      <div className="news-body news-event-body">
        <div className="news-meta">
          <span className="news-source">{item.sourceLabel}</span>
          {event.important ? <span className="important-label">重要</span> : null}
          {formatDay(event.latestAt) !== formatDay(now) ? <span>{formatDay(event.latestAt)}</span> : null}
        </div>
        <h2>{item.title}</h2>
        {shouldShowNewsContent(item.title, item.content) ? <p>{item.content}</p> : null}
        <NewsTags tags={item.tags} />
        <div className="event-evidence-summary">
          <span>{event.sourceCount} 家来源 · {event.itemCount} 条报道</span>
          <button type="button" className="event-disclosure" aria-expanded={expanded} aria-controls={detailsId} aria-label={disclosureLabel} onClick={onToggle}>
            <ChevronDown size={16} aria-hidden="true" />
            <span>{expanded ? "收起报道" : "展开报道"}</span>
          </button>
        </div>
        {expanded ? (
          <div id={detailsId} className="event-evidence-list" aria-label={`${item.title}的原始报道`}>
            {event.items.map((evidence) => <EvidenceItem item={evidence} key={evidence.id} />)}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function EvidenceItem({ item }: { item: FeedNewsItem }) {
  return (
    <div className={`event-evidence-item source-${item.source}`}>
      <i className="event-evidence-mark" />
      <div>
        <div className="event-evidence-meta">
          <span>{item.sourceLabel}</span>
          <time dateTime={item.publishedAt}>{formatDay(item.publishedAt)} {formatClock(item.publishedAt)}</time>
          {item.important ? <b>重要</b> : null}
        </div>
        <h3>{item.title}</h3>
        {shouldShowNewsContent(item.title, item.content) ? <p>{item.content}</p> : null}
      </div>
      <NewsSourceAccess item={item} />
    </div>
  );
}

function TimelineRail() {
  return <div className="timeline-rail" aria-hidden="true"><i /></div>;
}

function NewsTime({ publishedAt, now }: { publishedAt: string; now: number }) {
  return (
    <div className="news-time">
      <time dateTime={publishedAt}>{formatClock(publishedAt).slice(0, 5)}</time>
      <span>{relativeTime(publishedAt, now)}</span>
    </div>
  );
}

function NewsMeta({ item, now }: { item: FeedNewsItem; now: number }) {
  return (
    <div className="news-meta">
      <span className="news-source">{item.sourceLabel}</span>
      {item.important ? <span className="important-label">重要</span> : null}
      {formatDay(item.publishedAt) !== formatDay(now) ? <span>{formatDay(item.publishedAt)}</span> : null}
    </div>
  );
}

function NewsTags({ tags }: { tags: string[] | undefined }) {
  return Array.isArray(tags) && tags.length ? <div className="news-tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null;
}

function OriginalLink({ url, sourceLabel }: { url: string; sourceLabel: string }) {
  return (
    <a className="source-link" href={url} target="_blank" rel="noopener noreferrer" title={`查看${sourceLabel}单条原文`} aria-label={`查看${sourceLabel}单条原文`}>
      <ArrowUpRight size={16} />
    </a>
  );
}

function NewsSourceAccess({ item }: { item: FeedNewsItem }) {
  const access = newsLinkAccess(item.url);
  if (access.kind === "article") return <OriginalLink url={access.url} sourceLabel={item.sourceLabel} />;
  if (access.kind === "source-page") {
    return (
      <a
        className="source-link-status is-source-page"
        href={access.url}
        target="_blank"
        rel="noopener noreferrer"
        title={`打开${item.sourceLabel}来源聚合页（非单条原文）`}
        aria-label={`打开${item.sourceLabel}来源聚合页（非单条原文）`}
      ><ArrowUpRight size={14} /><span>来源聚合页</span></a>
    );
  }
  const label = access.kind === "missing" ? "未提供单条原文链接" : "原文链接不可用";
  return <span className="source-link-status" aria-label={`${item.sourceLabel}：${label}`}>{label}</span>;
}

function FeedState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state" role="status">
      <CircleAlert size={22} />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function NewsSkeleton() {
  return <>{Array.from({ length: 6 }, (_, index) => (
    <div className="news-skeleton" key={index}>
      <span /><div><i /><i /></div>
    </div>
  ))}</>;
}
