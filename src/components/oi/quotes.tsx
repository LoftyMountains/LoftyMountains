import { t as __t, translateValue as __tv, useLocale as __useLocale } from '@/i18n';
'use client';
/**
 * OSIRIS OI: what an actor quoted, and where from.
 *
 * Under a move, each quote in its own words with the source it came from, a
 * click away: the headline, the passage of the asker's data. A quote found
 * word for word in its source is marked verbatim; one that is not is marked
 * as a paraphrase, so a reader knows which threads hold all the way.
 */
import { ArrowDownRight, ArrowUpRight, BadgeCheck, ExternalLink, Minus } from 'lucide-react';
import type { RunState } from '@/lib/oi/state';
import type { Citation, ContextItem, Frame } from '@/lib/oi/types';
import { LABEL, T, gold, leanTo } from './theme';
import { TypeIcon } from './atoms';
/** Where a source is from, in a few words: the outlet, the site, the file, the feed. */
export function sourceLabel(c: ContextItem | undefined, id: string): string {
    if (!c)
        return id;
    if (c.kind === 'data')
        return c.id === 'data' ? 'Your data' : c.source;
    if (c.kind === 'wiki')
        return 'Wikipedia';
    return c.source || (c.kind === 'quake' ? 'Earthquakes' : c.kind === 'market' ? 'Markets' : 'News');
}
/** What kind of source it is, in a word. */
export const SOURCE_KIND: Record<ContextItem['kind'], string> = {
    web: 'Article', wiki: 'Background', news: 'Live feed', social: 'Social media', quake: 'Earthquake', market: 'Markets', series: 'Market data', odds: 'Prediction market', data: 'Your data', camera: 'Live camera',
};
/** A source's published page, opened apart from the app. */
export function SourceLink({ url, label = 'Open source', className = '' }: {
    url?: string;
    label?: string;
    className?: string;
}) {
    __useLocale();
    if (!url || !/^https?:\/\//i.test(url))
        return null;
    let host = '';
    try {
        host = new URL(url).hostname.replace(/^www\./, '');
    }
    catch {
        return null;
    }
    return (<a href={url} target="_blank" rel="noopener noreferrer nofollow" onClick={e => e.stopPropagation()} title={__tv(`${label}: ${host}`)} aria-label={__t("{0} at {1}", label, host)} className={`inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--gold-light)] transition-colors ${className}`}>
      <ExternalLink className="w-3 h-3 flex-shrink-0"/>
    </a>);
}
/** Which way a quote (or an event) pushed, in the question's terms. */
export function PushTag({ c, frame }: {
    c: Pick<Citation, 'push' | 'favors'>;
    frame: Frame | null;
}) {
    __useLocale();
    const push = c.push ?? 'neutral';
    if (push === 'neutral' && !c.favors) {
        return <span className="text-[9px] font-mono tracking-[0.1em] uppercase inline-flex items-center gap-0.5 text-[var(--text-muted)]" title={__t("Context: pushed neither way")}><Minus className="w-2.5 h-2.5"/>{__t("Context")}</span>;
    }
    const dir = push === 'no' ? 'no' : 'yes';
    const color = leanTo(dir);
    const word = frame?.kind === 'choice' ? (c.favors ? `For ${c.favors}` : 'For') : frame?.kind === 'number' ? (dir === 'yes' ? 'Pushes up' : 'Pushes down') : (dir === 'yes' ? 'Toward YES' : 'Toward NO');
    return (<span className="text-[9px] font-mono tracking-[0.1em] uppercase inline-flex items-center gap-0.5 max-w-[150px]" style={{ color }} title={__t("Which way it pushes the question")}>
      {__tv(dir === 'yes' ? <ArrowUpRight className="w-2.5 h-2.5 flex-shrink-0"/> : <ArrowDownRight className="w-2.5 h-2.5 flex-shrink-0"/>)}
      <span className="truncate">{__tv(word)}</span>
    </span>);
}
/** Whether a quote was found in its source as quoted. */
export function Verbatim({ exact }: {
    exact: boolean;
}) {
    __useLocale();
    return exact
        ? <span className="text-[9px] font-mono tracking-[0.1em] uppercase inline-flex items-center gap-0.5" style={{ color: T.gold }} title={__t("Found word for word in the source")}><BadgeCheck className="w-3 h-3"/>{__t("Verbatim")}</span>
        : <span className="text-[9px] font-mono tracking-[0.1em] uppercase text-[var(--text-muted)]" title={__t("Not found word for word in the source")}>{__t("Paraphrase")}</span>;
}
export function Quotes({ s, cites, onSelect }: {
    s: RunState;
    cites: Citation[] | undefined;
    onSelect: (key: string | null) => void;
}) {
    __useLocale();
    // A move made with no sources to quote has no cites at all; one where the actor quoted nothing says so.
    if (!cites)
        return null;
    if (!cites.length) {
        return s.context.length ? <p className={`mt-1.5 ${LABEL} text-[var(--text-muted)]`}>{__t("No source quoted")}</p> : null;
    }
    return (<div className="mt-2 flex flex-col gap-1.5">
      {__tv(cites.map(c => {
            const src = s.context.find(x => x.id === c.source);
            return (<div key={c.source} className="group relative border-l-2 pl-3 pr-1 py-1 rounded-r transition-colors hover:bg-[var(--hover-accent)]" style={{ borderColor: c.exact ? gold(0.6) : 'var(--border-primary)', background: 'rgba(255,255,255,0.015)' }}>
            <button onClick={e => { e.stopPropagation(); onSelect(`c:${c.source}`); }} title={__tv(src?.title ?? c.source)} className="block w-full text-left">
              <span className="block text-[11.5px] leading-relaxed text-[var(--text-primary)]">“{__tv(c.quote)}”</span>
              {__tv(c.why && <span className="block mt-0.5 text-[10.5px] leading-snug text-[var(--text-secondary)]">{__tv(c.why)}</span>)}
            </button>
            <span className="mt-1 flex items-center gap-1.5 min-w-0 text-[10px] font-mono tracking-[0.04em] text-[var(--text-muted)]">
              <PushTag c={c} frame={s.frame}/>
              <span className="w-px h-2.5 bg-[var(--border-secondary)] flex-shrink-0"/>
              <TypeIcon k={`c:${c.source}`} subtype={src?.kind} className="w-2.5 h-2.5 flex-shrink-0"/>
              <button onClick={e => { e.stopPropagation(); onSelect(`c:${c.source}`); }} className="truncate hover:text-[var(--text-primary)]">{__tv(sourceLabel(src, c.source))}</button>
              <span className="flex-shrink-0 opacity-70">[{__tv(c.source)}]</span>
              <SourceLink url={src?.url}/>
              <span className="ml-auto flex-shrink-0"><Verbatim exact={c.exact}/></span>
            </span>
          </div>);
        }))}
    </div>);
}
