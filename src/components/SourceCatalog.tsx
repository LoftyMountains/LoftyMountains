import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, BookOpen, ChevronRight, Database, ExternalLink, RefreshCw, X } from "lucide-react";
import type { IntelligenceSourceEntry, IntelligenceSourceRole, IntelligenceSourcesSnapshot } from "../../shared/types";
import { formatClock, formatFull } from "../lib/time";

export const sourceRoles: { id: IntelligenceSourceRole; label: string; description: string }[] = [
  { id: "primary", label: "Primary releases", description: "Policies, statistics and advisories from the issuing institution" },
  { id: "reporting", label: "Media reports", description: "Editorial news and event reporting" },
  { id: "observation", label: "Observations", description: "Receiver networks, event catalogs and observation records" },
  { id: "model", label: "Model estimates", description: "Positions and tracks calculated from input data" },
  { id: "reference", label: "Static reference", description: "Economic geography and corridor reference material" },
];
const stateLabels = { current: "Collection OK", delayed: "Delayed", unavailable: "Unavailable", pending: "No current data", reference: "Static reference" };
const productLabels = { news: "News", map: "Map", markets: "Markets" };
function link(value: string | null | undefined) { try { const url = new URL(value || ""); return ["http:", "https:"].includes(url.protocol) ? url.href : null; } catch { return null; } }
function stamp(value: string | null) { return value && Number.isFinite(Date.parse(value)) ? formatFull(value) : "Not available"; }
function interval(value: number | null) {
  if (!value) return "Irregular / static";
  if (value >= 3_600_000) return `About every ${Number((value / 3_600_000).toFixed(1))}h`;
  if (value >= 60_000) return `About every ${Math.round(value / 60_000)}m`;
  return `About every ${Math.round(value / 1_000)}s`;
}
interface CatalogData { snapshot: IntelligenceSourcesSnapshot | null; error: string | null; refreshing: boolean; onRefresh: () => void; }

export function SourceCatalogSummary({ snapshot, error, refreshing, onOpen }: Omit<CatalogData, "onRefresh"> & { onOpen: () => void }) {
  const current = snapshot?.sources.filter(source => source.health.state === "current").length || 0;
  return <section className="source-catalog-summary" aria-label="Source catalog overview">
    <button type="button" className="source-catalog-open" onClick={onOpen} aria-haspopup="dialog"><span><Database size={14} />Source catalog</span><span>{snapshot ? `${snapshot.sources.length} sources` : refreshing ? "Loading" : "View"}<ArrowUpRight size={13} /></span></button>
    <div className="source-role-summary">{sourceRoles.map(role => <div key={role.id}><span>{role.label}</span><strong>{snapshot ? snapshot.sources.filter(source => source.role === role.id).length : "—"}</strong></div>)}</div>
    <p>{error ? "Catalog delayed · view details" : snapshot ? `${current} sources healthy · grouped by evidence type` : refreshing ? "Connecting to source catalog…" : "Source catalog unavailable"}</p>
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
      <header className="source-catalog-header"><div><span className="source-catalog-eyebrow"><Database size={13} />DATA SOURCES</span><h2 id="source-catalog-title">Source catalog</h2></div><button ref={closeRef} type="button" className="economic-icon-button" onClick={onClose} aria-label="Close source catalog"><X size={19} /></button></header>
      <p className="source-catalog-intro" id="source-catalog-intro">Understand where a record comes from and what it can establish. Collection health and evidence type are shown separately. Successful collection does not verify the content.</p>
      <div className="source-catalog-roles" role="group" aria-label="Filter by evidence role"><button type="button" aria-pressed={role === "all"} onClick={() => setRole("all")}>All<span>{snapshot?.sources.length ?? "—"}</span></button>{sourceRoles.map(entry => <button type="button" key={entry.id} aria-pressed={role === entry.id} onClick={() => setRole(entry.id)} title={entry.description}>{entry.label}<span>{snapshot ? snapshot.sources.filter(source => source.role === entry.id).length : "—"}</span></button>)}</div>
      <div className="source-catalog-status"><span>{role === "all" ? "Current news, map and market sources" : sourceRoles.find(entry => entry.id === role)?.description}</span><button type="button" disabled={refreshing} onClick={onRefresh} aria-label="Refresh source catalog"><RefreshCw size={12} className={refreshing ? "source-spin" : ""} />Refresh status</button></div>
      {error || stale ? <p className="source-catalog-warning" role="status">{error || "The catalog snapshot is over 90 seconds old"}{snapshot ? ". Showing the last successful snapshot. Check each source retrieval time." : ". Please try again later."}</p> : null}
      <div className="source-catalog-scroll" aria-busy={!snapshot && refreshing}>
        {sources.length ? <div className="source-catalog-list">{sources.map(source => <SourceEntry key={source.id} source={source} expanded={expandedId === source.id} onToggle={() => setExpandedId(expandedId === source.id ? null : source.id)} />)}</div> : <div className="source-catalog-empty"><BookOpen size={25} /><strong>{!snapshot && refreshing ? "Loading source catalog" : snapshot ? "No sources in this group" : "Source catalog is unavailable"}</strong><p>{snapshot ? "Choose another evidence role to view connected sources." : "The catalog reads current status without starting new upstream collection."}</p>{!refreshing ? <button type="button" onClick={onRefresh}>Try again</button> : null}</div>}
      </div>
      <footer className="source-catalog-footer"><span>Current state · no stored history</span><span>{snapshot ? `Updated ${formatClock(snapshot.generatedAt)} · UTC+8` : "Waiting for sync"}</span></footer>
    </div>
  </dialog>;
}

function SourceEntry({ source, expanded, onToggle }: { source: IntelligenceSourceEntry; expanded: boolean; onToggle: () => void }) {
  const homepage = link(source.homepage); const terms = link(source.termsUrl);
  return <article className="source-catalog-entry" data-source-id={source.id}>
    <button type="button" className="source-catalog-entry-toggle" aria-expanded={expanded} aria-controls={`source-detail-${source.id}`} onClick={onToggle}>
      <span className="source-entry-top"><strong>{source.label}</strong><span className={`source-health is-${source.health.state}`}><i />{stateLabels[source.health.state]}</span><ChevronRight size={15} className={expanded ? "is-open" : ""} /></span>
      <span className="source-entry-publisher">{source.publisher}</span><span className="source-entry-coverage">{source.coverage}</span>
      <span className="source-entry-tags"><span>{source.evidenceLabel}</span><span>{source.products.map(product => productLabels[product]).join(" · ")}</span>{source.products.includes("news") && source.language === "en" ? <span>English source</span> : null}</span>
    </button>
    {expanded ? <div className="source-entry-detail" id={`source-detail-${source.id}`}>
      <dl><div><dt>Latest source record</dt><dd>{stamp(source.health.latestRecordAt)}</dd></div><div><dt>Last successful retrieval</dt><dd>{stamp(source.health.lastSuccessAt)}</dd></div><div><dt>Last checked</dt><dd>{stamp(source.health.checkedAt)}</dd></div><div><dt>Scheduled interval</dt><dd>{interval(source.refreshIntervalMs)}</dd></div>{source.health.itemCount !== null ? <div><dt>Current records</dt><dd>{source.health.itemCount.toLocaleString("en-US")}</dd></div> : null}</dl>
      <p className="source-entry-health-note">{source.health.message}</p><div className="source-entry-limits"><strong>Scope and limitations</strong><p>{source.limitations}</p></div>
      <div className="source-entry-links"><span>All times UTC+8</span>{terms ? <a href={terms} target="_blank" rel="noreferrer">Terms of use<ExternalLink size={11} /></a> : null}{homepage ? <a href={homepage} target="_blank" rel="noreferrer">Source homepage<ExternalLink size={11} /></a> : null}</div>
    </div> : null}
  </article>;
}
