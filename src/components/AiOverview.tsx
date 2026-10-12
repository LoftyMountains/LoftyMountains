import { apiUrl } from '@/lib/api-url';
import { t as __t, translateValue as __tv, useLocale as __useLocale } from '@/i18n';
'use client';
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, RefreshCw, X, Activity, ArrowLeftRight, CircleDot } from 'lucide-react';
import { SOURCE_ROLES, SOURCE_ROLE_ORDER, timeAgo, type AlertBrief, type AlertThread } from '@/lib/alert-digest';
/**
 * OSIRIS — One-Click AI Overview
 * Drop-in button that generates an intelligence read-out for whatever
 * data payload it's handed. Posts to /api/ai/overview, which works with
 * or without a Gemini key (heuristic analyst fallback), so it always
 * returns something useful. Alerts also get a structured brief whose
 * threads can filter the feed they were built from.
 */
interface AiOverviewProps {
    mode: 'alerts' | 'markets';
    payload: unknown;
    accent?: string;
    /** Changes when the underlying feed changes, so a stale read-out can say so. */
    signature?: string;
    activeThreadId?: string | null;
    onThreadSelect?: (id: string | null) => void;
    onOpenChange?: (open: boolean) => void;
}
interface OverviewResult {
    overview: string;
    highlights: string[];
    generatedBy: 'gemini' | 'analyst';
    generatedAt: string;
    brief?: AlertBrief;
    news_evidence?: {
        status: 'available' | 'partial' | 'unknown';
        requested: number;
        matched: number;
        excluded: number;
        restricted?: number;
        unverified?: number;
        checked_sources: number;
        total_sources: number;
        stale_sources: number;
        unavailable_sources: number;
        basis: string;
    };
}
function NewsEvidenceNotice({ evidence, reports }: { evidence: OverviewResult['news_evidence']; reports?: number }) {
    __useLocale();
    // Older responses without source-health evidence cannot establish current coverage.
    const status = !evidence || evidence.matched === 0 || reports === 0 ? 'unknown' : evidence.status;
    const title = status === 'unknown' ? 'No current news evidence' : status === 'partial' ? 'Incomplete news evidence' : 'Current news evidence';
    const allRestricted = Boolean(evidence?.restricted && evidence.restricted === evidence.requested && evidence.matched === 0);
    return <div role="status" aria-label={__t(title)} className={`mb-2 rounded-md border px-2 py-1.5 text-[10px] leading-relaxed ${status === 'available' ? 'border-white/10 bg-white/[0.02]' : 'border-amber-400/30 bg-amber-400/[0.06]'}`}>
      <p className="font-semibold text-[var(--text-primary)]">{__t(title)}</p>
      {status !== 'available' && <p className="mt-0.5 text-[var(--text-secondary)]">{__t(status === 'unknown'
          ? allRestricted
              ? 'No submitted news records can be used for this analysis because publisher permission is not established. This does not mean the reports are false or that conditions are safe.'
              : 'Current news evidence cannot be confirmed for this overview. News conditions are unknown; missing data does not establish safe conditions.'
          : 'Some sources or submitted reports are missing from this overview. The available reports do not establish a complete picture or safe conditions.')}</p>}
      {evidence && <>
        <p className="mt-1 text-[var(--text-secondary)]">{__t('Current source checks: {0}/{1}. Stale sources: {2}. Unavailable sources: {3}.', evidence.checked_sources, evidence.total_sources, evidence.stale_sources, evidence.unavailable_sources)}</p>
        <p className="text-[var(--text-secondary)]">{__t('Matched {0} of {1} submitted news records; {2} excluded.', evidence.matched, evidence.requested, evidence.excluded)}</p>
        {Boolean(evidence.restricted) && <p className="mt-1 text-[var(--text-secondary)]">{__t('Excluded by publisher usage restrictions: {0}. This is not a finding that the reports are false.', evidence.restricted)}</p>}
        {Boolean(evidence.unverified) && <p className="text-[var(--text-secondary)]">{__t('Records without a current admitted snapshot match: {0}.', evidence.unverified)}</p>}
        {evidence.basis && <p className="mt-1 text-[var(--text-muted)]">{__tv(evidence.basis)}</p>}
      </>}
    </div>;
}
function overviewProse(result: OverviewResult): string {
    // Preserve server findings, including omitted evidence. Translate known interface
    // sentences only; unfamiliar text and source headlines remain as returned.
    return result.generatedBy === 'gemini' ? result.overview : result.overview.split('\n').map(line => {
        const bullet = line.startsWith('• ') ? '• ' : '';
        return bullet + __tv(bullet ? line.slice(2) : line);
    }).join('\n');
}
function SourceRoleBar({ roles }: { roles: AlertThread['roles'] }) {
    __useLocale();
    const total = SOURCE_ROLE_ORDER.reduce((n, role) => n + (roles?.[role] || 0), 0);
    if (!total) return null;
    return <div className="flex h-1 w-full overflow-hidden rounded-full bg-white/5" aria-hidden="true">
      {SOURCE_ROLE_ORDER.map(role => roles?.[role] ? <div key={role} style={{ width: `${(roles[role]! / total) * 100}%`, background: SOURCE_ROLES[role].color }}/> : null)}
    </div>;
}
function ThreadRow({ thread, active, accent, onSelect }: {
    thread: AlertThread;
    active: boolean;
    accent: string;
    onSelect?: (id: string | null) => void;
}) {
    __useLocale();
    const roleSummary = SOURCE_ROLE_ORDER.filter(role => thread.roles?.[role]).map(role => `${__t(SOURCE_ROLES[role].label)}: ${thread.roles![role]}`).join(' · ') || __t('Unclassified source');
    return (<button type="button" onClick={() => onSelect?.(active ? null : thread.id)} disabled={!onSelect} aria-pressed={active} className="w-full text-left rounded-md border px-2 py-1.5 transition-colors disabled:cursor-default" style={{
            borderColor: active ? `${accent}88` : 'rgba(255,255,255,0.06)',
            background: active ? `${accent}14` : 'rgba(255,255,255,0.02)',
        }} title={__tv(onSelect ? (active ? 'Show all alerts' : 'Show only this thread') : undefined)}>
      <div className="flex items-center gap-1.5">
        <span className="flex-1 min-w-0 truncate text-[11px] font-semibold text-[var(--text-primary)]">{__tv(thread.label)}</span>
        <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color: accent }}>{__tv(thread.count)}</span>
      </div>
      <div className="mt-1"><SourceRoleBar roles={thread.roles}/><p className="mt-1 text-[9px] text-[var(--text-muted)]">{roleSummary}</p></div>
      <div className="mt-1 flex items-center gap-1.5 text-[9px] font-mono text-[var(--text-muted)]">
        <span className="truncate">{__tv(thread.sources.length)}{__t(" sources")}{__tv(thread.topics.length ? ` · ${thread.topics.join(' · ')}` : '')}</span>
        {__tv(thread.breaking > 0 && <span className="text-[#FF5A5A] flex-shrink-0">· {__tv(thread.breaking)}{__t(" BREAKING")}</span>)}
        {__tv(thread.latest && <span className="ml-auto flex-shrink-0">{__tv(timeAgo(thread.latest))}</span>)}
      </div>
      {__tv(thread.lead && (<div className="mt-1 text-[10px] leading-snug text-[var(--text-secondary)] line-clamp-2">
          {thread.lead.title} <span className="text-[var(--text-muted)]">— {thread.lead.source}</span>
        </div>))}
    </button>);
}
export function AlertsBrief({ result, accent, activeThreadId, onThreadSelect }: {
    result: OverviewResult & {
        brief: AlertBrief;
    };
    accent: string;
    activeThreadId?: string | null;
    onThreadSelect?: (id: string | null) => void;
}) {
    __useLocale();
    const { brief } = result;
    const prose = overviewProse(result);
    const quake = brief.seismic?.strongest;
    return (<>
      <NewsEvidenceNotice evidence={result.news_evidence} reports={brief.coverage.reports}/>
      <p className="font-sans text-[12px] leading-relaxed text-[var(--text-primary)] whitespace-pre-line">{prose}</p>

      {__tv(brief.threads.length > 0 && (<div className="mt-2.5">
          <div className="mb-1 flex items-center gap-1 text-[8.5px] font-mono tracking-widest text-[var(--text-muted)]">
            <Activity className="w-2.5 h-2.5"/>{__t(" THREADS")}{__tv(onThreadSelect ? ' · TAP TO FILTER' : '')}
          </div>
          <div className="space-y-1">
            {__tv(brief.threads.map(t => (<ThreadRow key={t.id} thread={t} accent={accent} active={activeThreadId === t.id} onSelect={onThreadSelect}/>)))}
          </div>
        </div>))}

      {__tv(quake && (<div className="mt-2 flex items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] px-2 py-1.5 text-[10px]">
          <CircleDot className="w-3 h-3 flex-shrink-0" style={{ color: quake.magnitude >= 6 ? '#FF3D3D' : quake.magnitude >= 5 ? '#FF9500' : '#FFD700' }}/>
          <span className="flex-1 min-w-0 truncate text-[var(--text-secondary)]">{__t("Strongest quake ")}<b className="text-[var(--text-primary)]">{__t("M")}{__tv(quake.magnitude.toFixed(1))}</b> {__tv(quake.place)}
          </span>
          {__tv(quake.tsunami && <span className="text-[8.5px] font-mono text-[#448AFF]">{__t("TSUNAMI FLAG")}</span>)}
          <span className="font-mono text-[9px] text-[var(--text-muted)] flex-shrink-0">{__tv(brief.seismic!.count)}{__t(" total")}</span>
        </div>))}

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[8.5px] font-mono text-[var(--text-muted)]">
        <span>{__tv(brief.coverage.reports)}{__t(" REPORTS")}</span>
        <span>· {__tv(brief.coverage.channels)}{__t(" SOURCES")}</span>
        {__tv(brief.coverage.corroborated > 0 && (<span className="inline-flex items-center gap-0.5"><ArrowLeftRight className="w-2 h-2"/> {__tv(brief.coverage.corroborated)}{__t(" CROSS-POSTED")}</span>))}
        {__tv(brief.coverage.newest && <span>{__t("\u00B7 NEWEST ")}{__tv(timeAgo(brief.coverage.newest))}</span>)}
      </div>
      <div className="mt-1 text-[8.5px] leading-snug text-[var(--text-muted)]">
        {__tv(result.generatedBy === 'gemini'
            ? 'Read-out by Gemini 2.0 Flash from the attributed headlines. Threads: '
            : 'Heuristic analyst, no model. ')}
        {__t("Topic clustering groups reports; it does not verify claims. Repeated reporting and source roles do not establish independent corroboration.")}
      </div>
    </>);
}
export default function AiOverview({ mode, payload, accent = '#7C4DFF', signature, activeThreadId, onThreadSelect, onOpenChange, }: AiOverviewProps) {
    __useLocale();
    const [open, setOpenState] = useState(false);
    const setOpen = useCallback((next: boolean) => {
        setOpenState(next);
        onOpenChange?.(next);
    }, [onOpenChange]);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<OverviewResult | null>(null);
    const [resultSignature, setResultSignature] = useState<string | undefined>(undefined);
    const [error, setError] = useState<string | null>(null);
    const generate = useCallback(async () => {
        setLoading(true);
        setError(null);
        const sig = signature;
        try {
            const res = await fetch(apiUrl('/api/ai/overview'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode, payload }),
            });
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            setResult(await res.json());
            setResultSignature(sig);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to generate overview');
        }
        finally {
            setLoading(false);
        }
    }, [mode, payload, signature]);
    const handleClick = useCallback(() => {
        const next = !open;
        setOpen(next);
        if (next && !result && !loading)
            generate();
    }, [open, result, loading, generate, setOpen]);
    const stale = Boolean(result && signature && resultSignature && signature !== resultSignature);
    const brief = result?.brief;
    return (<div className="w-full">
      <button onClick={handleClick} aria-expanded={open} className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-mono tracking-wider transition-all border hover:brightness-125" style={{
            color: accent,
            borderColor: `${accent}55`,
            background: `${accent}12`,
        }}>
        {__tv(loading ? <Loader2 className="w-3 h-3 animate-spin"/> : <Sparkles className="w-3 h-3"/>)}
        {__tv(loading ? 'ANALYZING…' : open ? 'HIDE AI OVERVIEW' : 'AI OVERVIEW')}
        {__tv(stale && !loading && <span className="ml-1 w-1.5 h-1.5 rounded-full animate-osiris-pulse" style={{ background: accent }} title={__t("The feed has changed since this read-out")}/>)}
      </button>

      <AnimatePresence initial={false}>
        {__tv(open && (<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="mt-2 p-2.5 rounded-lg border text-[11px] leading-relaxed" style={{ borderColor: `${accent}33`, background: `${accent}08` }}>
              {/* Header row */}
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono tracking-widest text-[9px]" style={{ color: accent }}>
                  {__tv(result ? `OSIRIS ${result.generatedBy === 'gemini' ? 'AI' : 'ANALYST'}` : 'OSIRIS ANALYST')}
                  {__tv(result && <span className="text-[var(--text-muted)]"> · {__tv(timeAgo(result.generatedAt))}</span>)}
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={generate} disabled={loading} className="hover:opacity-70 transition-opacity" title={__t("Regenerate")} aria-label={__t("Regenerate overview")}>
                    <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} style={{ color: accent }}/>
                  </button>
                  <button onClick={() => setOpen(false)} className="hover:opacity-70 transition-opacity" title={__t("Close")} aria-label={__t("Close overview")}>
                    <X className="w-3 h-3 text-[var(--text-muted)]"/>
                  </button>
                </div>
              </div>

              {mode === 'alerts' && <p className="mb-2 text-[10px] text-[var(--text-secondary)]">{__t('Apply equal standards to all civilians. Attribute humanitarian needs and casualty figures to their sources. Use adopted resolutions and verified Council statements for its collective position; an AI summary is not a Council decision.')}</p>}

              {__tv(stale && !loading && (<button onClick={generate} className="mb-2 w-full rounded border px-2 py-1 text-left text-[9.5px] font-mono tracking-wide transition-colors hover:bg-white/5" style={{ borderColor: `${accent}44`, color: accent }}>{__t("FEED UPDATED SINCE THIS READ-OUT \u2014 REGENERATE")}</button>))}

              {__tv(loading && !result && (<div className="flex items-center gap-2 py-2 text-[var(--text-muted)]">
                  <Loader2 className="w-3 h-3 animate-spin"/>{__t(" Reading the feed\u2026")}</div>))}

              {__tv(error && <div className="text-[var(--alert-red)] py-1">⚠ {__tv(error)}</div>)}

              {__tv(result && brief && (<AlertsBrief result={{ ...result, brief }} accent={accent} activeThreadId={activeThreadId} onThreadSelect={onThreadSelect}/>))}

              {__tv(result && !brief && (<>
                  {mode === 'alerts' && <NewsEvidenceNotice evidence={result.news_evidence}/>}
                  <div className="text-[var(--text-primary)] whitespace-pre-line">{__tv(result.overview)}</div>

                  {__tv(result.highlights.length > 0 && (<div className="flex flex-wrap gap-1 mt-2">
                      {__tv(result.highlights.map((h, i) => (<span key={i} className="px-1.5 py-0.5 rounded text-[9px] font-mono" style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}33` }}>
                          {__tv(h)}
                        </span>)))}
                    </div>))}

                  <div className="mt-2 text-[9px] font-mono text-[var(--text-muted)] tracking-wide">
                    {__tv(result.generatedBy === 'gemini' ? 'GEMINI 2.0 FLASH' : 'HEURISTIC ANALYST')} ·{__t(" ")}
                    {__tv(new Date(result.generatedAt).toLocaleTimeString())}
                  </div>
                </>))}
            </div>
          </motion.div>))}
      </AnimatePresence>
    </div>);
}
