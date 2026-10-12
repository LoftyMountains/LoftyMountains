import { t as __t, translateValue as __tv, useLocale as __useLocale } from '@/i18n';
'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Newspaper, ChevronDown, ChevronUp, ExternalLink, MapPin, Zap } from 'lucide-react';
import { SourcePanel } from './LiveAlerts';
import { SOURCE_ROLES, sourceRole, timeAgo } from '@/lib/alert-digest';
/* ═══════════════════════════════════════════════════════════════
   OSIRIS — Intelligence Feed
   Attributed news reports and their source-use boundaries
   ═══════════════════════════════════════════════════════════════ */
interface IntelFeedProps {
    data: any;
    onLocate?: (lat: number, lng: number) => void;
}
export default function IntelFeed({ data, onLocate }: IntelFeedProps) {
    __useLocale();
    const [expanded, setExpanded] = useState(true);
    const news = data.news || [];
    const sources = data.news_meta?.sources ?? [];
    const excluded = data.news_meta?.excluded_sources ?? [];
    const analysisRestricted = (item: any) => item.analysis_allowed === false || sources.some((source: { id?: string; analysis_allowed?: boolean }) => source.id && source.id === item.source_id && source.analysis_allowed === false);
    const allowsAnalysis = (item: any) => item.analysis_allowed === true && !analysisRestricted(item);
    return (<motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6, duration: 0.6 }} className="glass-panel flex flex-col overflow-hidden pointer-events-auto">
      {/* Header */}
      <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} className="flex items-center justify-between px-4 py-3 hover:bg-[var(--hover-accent)] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--gold-primary)]">
        <div className="flex items-center gap-2">
          <Newspaper className="w-3.5 h-3.5 text-[var(--gold-primary)]"/>
          <span className="hud-text text-[11px] text-[var(--text-primary)]">{__t("News reports")}</span>
          <span className="gotham-tag gotham-tag--info" style={{ fontSize: '9px', padding: '1px 5px' }}>{__tv(news.length)}</span>
        </div>
        <div className="flex items-center gap-2">
          {__tv(expanded ? <ChevronUp className="w-3 h-3 text-[var(--text-muted)]"/> : <ChevronDown className="w-3 h-3 text-[var(--text-muted)]"/>)}
        </div>
      </button>

      {/* News Items */}
      <AnimatePresence>
        {__tv(expanded && (<motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="px-3 pb-2"><SourcePanel sources={sources} excluded={excluded}/></div>
            <div className="max-h-[400px] overflow-y-auto styled-scrollbar divide-y divide-[var(--border-secondary)]">
              {__tv(news.length === 0 ? (<div className="px-4 py-6 text-center">
                  <span role="status" className="text-[10px] font-mono text-[var(--text-muted)]">{__t("No reports in the current feed window. Missing data does not establish safe conditions.")}</span>
                </div>) : (news.slice(0, 25).map((item: any, i: number) => (<article key={item.id ?? i} className="px-4 py-2.5 hover:bg-[var(--hover-accent)] transition-colors break-words">
                    {/* Publisher role describes provenance, not independent verification. */}
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-[9px] font-mono" style={{ color: SOURCE_ROLES[sourceRole(item.source_role)].color }}>
                        {__t(SOURCE_ROLES[sourceRole(item.source_role)].label)}
                      </span>
                      <span className="text-[9px] font-mono text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded">
                        {item.source_name || item.source}
                      </span>
                      {__tv(allowsAnalysis(item) && item.coords && (<button type="button" onClick={() => {
                        onLocate?.(item.coords[0], item.coords[1]);
                    }} className="text-[var(--text-muted)] hover:text-[var(--cyan-primary)] transition-colors" aria-label={__t('Show on map')} title={__tv(item.coords_anchor ? `Approximate: centroid for "${item.coords_anchor}", not the event location` : 'Approximate location')}>
                          <MapPin className="w-2.5 h-2.5"/>
                        </button>))}
                      <time dateTime={item.published || undefined} className="text-[9px] font-mono text-[var(--text-muted)] ml-auto">{__tv(timeAgo(item.published) || 'Unknown')}</time>
                    </div>

                    {/* Title */}
                    <h4 className="text-[10px] text-[var(--text-primary)] leading-tight line-clamp-2">
                      {item.link ? <a href={item.link} target="_blank" rel="noopener noreferrer" className="hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--gold-primary)]">{item.title}</a> : item.title}
                    </h4>
                    {item.summary && <p className="mt-1 text-[10px] leading-relaxed text-[var(--text-secondary)] line-clamp-3">{item.summary}</p>}
                    {analysisRestricted(item) && <p className="mt-1 text-[9px] text-[var(--gold-primary)]">{__t('Display only; excluded from automated analysis.')}</p>}

                    {/* Keyword matches describe text, not verification or an impact assessment. */}
                    {__tv(allowsAnalysis(item) && item.keyword_assessment && (<div className="mt-1.5 flex items-start gap-1.5 bg-red-950/20 border border-red-900/20 rounded px-2 py-1">
                        <Zap className="w-2.5 h-2.5 text-red-400 flex-shrink-0 mt-0.5"/>
                        <span className="text-[10px] font-mono text-red-400/80 leading-relaxed">
                          {__tv(item.keyword_assessment)}
                        </span>
                      </div>))}

                    {item.link && <a href={item.link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[10px] font-mono text-[var(--cyan-primary)] hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--gold-primary)]"><ExternalLink className="w-2.5 h-2.5"/>{__t('Open original report')}</a>}
                  </article>))))}
            </div>
          </motion.div>))}
      </AnimatePresence>
    </motion.div>);
}
