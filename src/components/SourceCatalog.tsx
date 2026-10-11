import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, BookOpen, ChevronRight, Database, ExternalLink, RefreshCw, X } from "lucide-react";
import type { IntelligenceSourceEntry, IntelligenceSourceRole, IntelligenceSourcesSnapshot } from "../../shared/types";
import { formatClock, formatFull } from "../lib/time";

export const sourceRoles: { id: IntelligenceSourceRole; label: string; description: string }[] = [
  { id: "primary", label: "机构原文", description: "发布机构的政策、统计与通报" },
  { id: "reporting", label: "媒体报道", description: "新闻编辑与事件报道" },
  { id: "observation", label: "观测与汇编", description: "接收网络、灾害目录与观测记录" },
  { id: "model", label: "模型推算", description: "由输入数据推算位置或轨迹" },
  { id: "reference", label: "静态参考", description: "经济地理与通道背景资料" },
];
const stateLabels = { current: "采集正常", delayed: "更新延迟", unavailable: "暂不可用", pending: "暂无当前数据", reference: "静态参考" };
const productLabels = { news: "快讯", map: "地图", markets: "行情" };
function link(value: string | null | undefined) { try { const url = new URL(value || ""); return ["http:", "https:"].includes(url.protocol) ? url.href : null; } catch { return null; } }
function stamp(value: string | null) { return value && Number.isFinite(Date.parse(value)) ? formatFull(value) : "暂无记录"; }
function interval(value: number | null) {
  if (!value) return "不定期 / 静态资料";
  if (value >= 3_600_000) return `约每 ${Number((value / 3_600_000).toFixed(1))} 小时`;
  if (value >= 60_000) return `约每 ${Math.round(value / 60_000)} 分钟`;
  return `约每 ${Math.round(value / 1_000)} 秒`;
}
interface CatalogData { snapshot: IntelligenceSourcesSnapshot | null; error: string | null; refreshing: boolean; onRefresh: () => void; }

export function SourceCatalogSummary({ snapshot, error, refreshing, onOpen }: Omit<CatalogData, "onRefresh"> & { onOpen: () => void }) {
  const current = snapshot?.sources.filter(source => source.health.state === "current").length || 0;
  return <section className="source-catalog-summary" aria-label="来源目录概览">
    <button type="button" className="source-catalog-open" onClick={onOpen} aria-haspopup="dialog"><span><Database size={14} />来源目录</span><span>{snapshot ? `${snapshot.sources.length} 个来源` : refreshing ? "加载中" : "查看"}<ArrowUpRight size={13} /></span></button>
    <div className="source-role-summary">{sourceRoles.map(role => <div key={role.id}><span>{role.label}</span><strong>{snapshot ? snapshot.sources.filter(source => source.role === role.id).length : "—"}</strong></div>)}</div>
    <p>{error ? "目录更新延迟 · 点击查看" : snapshot ? `${current} 个来源采集正常 · 证据性质分层展示` : refreshing ? "正在连接来源目录…" : "暂未获得来源目录"}</p>
  </section>;
}

export function SourceCatalog({ snapshot, error, refreshing, onRefresh, open, initialSourceId, onClose }: CatalogData & { open: boolean; initialSourceId: string | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [role, setRole] = useState<IntelligenceSourceRole | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setRole("all"); setExpandedId(initialSourceId); setClock(Date.now());
      if (!dialog.open) dialog.showModal();
      closeRef.current?.focus({ preventScroll: true });
      const previous = document.body.style.overflow; document.body.style.overflow = "hidden";
      const timer = window.setInterval(() => setClock(Date.now()), 30_000);
      return () => {
        window.clearInterval(timer); document.body.style.overflow = previous;
        if (dialog.open) dialog.close();
        if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
      };
    }
    if (dialog.open) dialog.close();
  }, [open, initialSourceId]);
  const hasSnapshot = !!snapshot;
  useEffect(() => {
    if (!open || !initialSourceId || !hasSnapshot) return;
    const entry = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("[data-source-id]") || []).find(element => element.dataset.sourceId === initialSourceId);
    entry?.scrollIntoView({ block: "nearest", behavior: "instant" as ScrollBehavior });
  }, [open, initialSourceId, hasSnapshot]);
  const sources = (snapshot?.sources || []).filter(source => role === "all" || source.role === role)
    .sort((a, b) => sourceRoles.findIndex(entry => entry.id === a.role) - sourceRoles.findIndex(entry => entry.id === b.role));
  const stale = !!snapshot && clock - Date.parse(snapshot.generatedAt) > 90_000;
  return <dialog ref={dialogRef} className="source-catalog-dialog" aria-labelledby="source-catalog-title" aria-describedby="source-catalog-intro" onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => {
      if (event.key !== "Tab") return;
      const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter(element => element.getClientRects().length > 0);
      const first = focusable[0]; const last = focusable.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <div className="source-catalog-shell">
      <header className="source-catalog-header"><div><span className="source-catalog-eyebrow"><Database size={13} />DATA SOURCES</span><h2 id="source-catalog-title">来源目录</h2></div><button ref={closeRef} type="button" className="economic-icon-button" onClick={onClose} aria-label="关闭来源目录"><X size={19} /></button></header>
      <p className="source-catalog-intro" id="source-catalog-intro">先看记录来自哪里，再看它能说明什么。采集状态与证据性质分别呈现；正常采集不代表内容已核验。</p>
      <div className="source-catalog-roles" role="group" aria-label="按证据角色筛选"><button type="button" aria-pressed={role === "all"} onClick={() => setRole("all")}>全部<span>{snapshot?.sources.length ?? "—"}</span></button>{sourceRoles.map(entry => <button type="button" key={entry.id} aria-pressed={role === entry.id} onClick={() => setRole(entry.id)} title={entry.description}>{entry.label}<span>{snapshot ? snapshot.sources.filter(source => source.role === entry.id).length : "—"}</span></button>)}</div>
      <div className="source-catalog-status"><span>{role === "all" ? "覆盖当前接入的快讯、地图与行情" : sourceRoles.find(entry => entry.id === role)?.description}</span><button type="button" disabled={refreshing} onClick={onRefresh} aria-label="刷新来源目录"><RefreshCw size={12} className={refreshing ? "source-spin" : ""} />刷新状态</button></div>
      {error || stale ? <p className="source-catalog-warning" role="status">{error || "目录快照已超过 90 秒未更新"}{snapshot ? "。暂显示上次成功快照，请核对各来源采集时间。" : "。可稍后重试。"}</p> : null}
      <div className="source-catalog-scroll" aria-busy={!snapshot && refreshing}>
        {sources.length ? <div className="source-catalog-list">{sources.map(source => <SourceEntry key={source.id} source={source} expanded={expandedId === source.id} onToggle={() => setExpandedId(expandedId === source.id ? null : source.id)} />)}</div> : <div className="source-catalog-empty"><BookOpen size={25} /><strong>{!snapshot && refreshing ? "正在读取来源目录" : snapshot ? "此分组暂未接入来源" : "暂时无法获取来源目录"}</strong><p>{snapshot ? "切换其他证据角色查看已接入来源。" : "来源目录只读取当前状态，不触发新的采集。"}</p>{!refreshing ? <button type="button" onClick={onRefresh}>重新获取</button> : null}</div>}
      </div>
      <footer className="source-catalog-footer"><span>当前状态 · 不保存历史</span><span>{snapshot ? `更新于 ${formatClock(snapshot.generatedAt)} · 北京时间` : "等待同步"}</span></footer>
    </div>
  </dialog>;
}

function SourceEntry({ source, expanded, onToggle }: { source: IntelligenceSourceEntry; expanded: boolean; onToggle: () => void }) {
  const homepage = link(source.homepage); const terms = link(source.termsUrl);
  return <article className="source-catalog-entry" data-source-id={source.id}>
    <button type="button" className="source-catalog-entry-toggle" aria-expanded={expanded} aria-controls={`source-detail-${source.id}`} onClick={onToggle}>
      <span className="source-entry-top"><strong>{source.label}</strong><span className={`source-health is-${source.health.state}`}><i />{stateLabels[source.health.state]}</span><ChevronRight size={15} className={expanded ? "is-open" : ""} /></span>
      <span className="source-entry-publisher">{source.publisher}</span><span className="source-entry-coverage">{source.coverage}</span>
      <span className="source-entry-tags"><span>{source.evidenceLabel}</span><span>{source.products.map(product => productLabels[product]).join(" · ")}</span>{source.products.includes("news") && source.language === "en" ? <span>英文来源</span> : null}</span>
    </button>
    {expanded ? <div className="source-entry-detail" id={`source-detail-${source.id}`}>
      <dl><div><dt>最新原始记录时间</dt><dd>{stamp(source.health.latestRecordAt)}</dd></div><div><dt>最近成功采集时间</dt><dd>{stamp(source.health.lastSuccessAt)}</dd></div><div><dt>最近检查时间</dt><dd>{stamp(source.health.checkedAt)}</dd></div><div><dt>计划更新间隔</dt><dd>{interval(source.refreshIntervalMs)}</dd></div>{source.health.itemCount !== null ? <div><dt>当前记录数</dt><dd>{source.health.itemCount.toLocaleString()}</dd></div> : null}</dl>
      <p className="source-entry-health-note">{source.health.message}</p><div className="source-entry-limits"><strong>使用边界</strong><p>{source.limitations}</p></div>
      <div className="source-entry-links"><span>时间均为北京时间</span>{terms ? <a href={terms} target="_blank" rel="noreferrer">使用条款<ExternalLink size={11} /></a> : null}{homepage ? <a href={homepage} target="_blank" rel="noreferrer">来源主页<ExternalLink size={11} /></a> : null}</div>
    </div> : null}
  </article>;
}
