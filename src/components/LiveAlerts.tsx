import { t as __t, translateValue as __tv, useLocale as __useLocale } from '@/i18n';
'use client';
import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, MapPin, ExternalLink, Radio, Maximize2, Minimize2, Search, X, RefreshCw, Image as ImageIcon, Play, Eye, Repeat2, CornerDownRight, Waves, Layers, AlertTriangle, } from 'lucide-react';
import AiOverview from './AiOverview';
import { ALERT_KINDS, BLOCS, SOURCE_ROLES, SOURCE_ROLE_ORDER, UNSC_REFERENCES, sourceRole, buildThreads, groupStatements, timeAgo, type AlertKind, type Bloc, type SourceRole, type DigestReport, } from '@/lib/alert-digest';
interface SourceHealth {
    id?: string;
    handle: string;
    name: string;
    source_role?: SourceRole;
    authority_note?: string;
    analysis_allowed?: boolean;
    count: number;
    latest: string | null;
    status?: 'ok' | 'empty' | 'stale' | 'unavailable';
    last_attempt_at?: string | null;
    last_success_at?: string | null;
    last_checked_at?: string | null;
    error?: string | null;
    stale?: boolean;
}
interface ExcludedSource { id: string; name: string; admission_reason: string }
/** The slice of dashboard state this panel reads. */
interface LiveAlertsData {
    news?: unknown[];
    earthquakes?: unknown[];
    weather_events?: unknown[];
    news_meta?: {
        sources?: SourceHealth[];
        fetchedAt?: string | null;
        excluded_sources?: ExcludedSource[];
        humanitarian_policy?: unknown;
    };
}
/** Where to fly: `alertId` also opens that report's pin on the map. */
export interface LocateOptions {
    zoom?: number;
    alertId?: string;
}
interface LiveAlertsProps {
    data: LiveAlertsData;
    onLocate: (lat: number, lng: number, options?: LocateOptions) => void;
    /** Whether the reports being shown are pinned on the map, and the switch for it. */
    pinsOn?: boolean;
    onTogglePins?: (on: boolean) => void;
    /** The pinned reports the filters currently leave showing, so the map can follow. */
    onPinnedChange?: (ids: string[]) => void;
    onWatchFeed?: (url: string, name: string) => void;
    /** Re-pull /api/news. */
    onRefresh?: () => Promise<unknown> | void;
}
const ACCENT = '#FF4081';
type Tab = 'all' | 'news' | 'warnings' | 'quakes' | 'feeds';
/** The official warnings from /api/weather — NOAA/NWS, GDACS and NASA EONET. */
export interface WarningAlert {
    kind: 'warning';
    id: string;
    ts: number;
    title: string;
    /** "Flash Flood Warning", "Tropical Cyclone" — the issuer's own words. */
    type: string;
    severity: 'high' | 'medium' | 'low';
    /** The counties or region it was issued for, where the issuer names them. */
    area: string | null;
    expires: number | null;
    provider: string;
    url: string | null;
    lat: number;
    lng: number;
    haystack: string;
}
interface Carrier {
    source: string;
    source_name: string;
    lean: string | null;
    bloc: Bloc | null;
    source_role: SourceRole;
    source_authority_note: string | null;
    link: string | null;
    published: string | null;
}
interface NewsAlert {
    analysis_allowed: boolean;
    kind: 'news';
    id: string;
    ts: number;
    title: string;
    summary: string;
    text: string;
    link: string | null;
    published: string;
    source: string;
    source_name: string;
    lean: string | null;
    bloc: Bloc | null;
    source_role: SourceRole;
    source_authority_note: string | null;
    flag: string | null;
    alertKind: AlertKind;
    /** The place the report names, when one resolved; otherwise `anchor` is a country centroid. */
    place: {
        name: string;
        label: string;
        precision: 'settlement' | 'region';
    } | null;
    media: {
        kind: 'photo' | 'video';
        thumb: string | null;
        duration: string | null;
        video: string | null;
        count: number;
    } | null;
    forwarded_from: {
        name: string;
        url: string | null;
    } | null;
    reply_to: string | null;
    views: number | null;
    carriers: Carrier[];
    keywords: string[];
    coords: [
        number,
        number
    ] | null;
    anchor: string | null;
    haystack: string;
}
interface QuakeAlert {
    kind: 'quake';
    id: string;
    ts: number;
    magnitude: number;
    place: string;
    depth: number | null;
    url: string | null;
    tsunami: boolean;
    felt: number | null;
    pager: string | null;
    lat: number;
    lng: number;
}
type AlertItem = NewsAlert | QuakeAlert | WarningAlert;
/** What the list renders: one alert, or a run of statements from one speaker. */
type Unit = {
    kind: 'item';
    key: string;
    ts: number;
    item: AlertItem;
} | {
    kind: 'statement';
    key: string;
    ts: number;
    speaker: string;
    items: NewsAlert[];
};
type Loose = Record<string, unknown>;
const rec = (v: unknown): Loose => (v !== null && typeof v === 'object' ? (v as Loose) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** Only http(s) targets become links or image sources. */
const webUrl = (v: unknown): string | null => {
    const u = str(v);
    return u && /^https?:\/\//i.test(u) ? u : null;
};
const isBloc = (v: unknown): v is Bloc => typeof v === 'string' && Object.hasOwn(BLOCS, v);
function toNews(raw: unknown): NewsAlert | null {
    const a = rec(raw);
    const title = str(a.title);
    const published = str(a.published);
    const ts = published ? Date.parse(published) : NaN;
    if (!title || !published || !Number.isFinite(ts))
        return null;
    const text = str(a.description) ?? '';
    const summary = typeof a.summary === 'string'
        ? a.summary
        : text.startsWith(title) ? text.slice(title.length).trim() : text;
    const source = str(a.source) ?? 'unknown';
    const sourceName = str(a.source_name) ?? source;
    const lean = str(a.lean);
    const carriers: Carrier[] = (Array.isArray(a.also_reported_by) ? a.also_reported_by : []).map(item => {
        const c = rec(item);
        const cSource = str(c.source) ?? 'unknown';
        return {
            source: cSource,
            source_name: str(c.source_name) ?? cSource,
            lean: str(c.lean),
            bloc: isBloc(c.bloc) ? c.bloc : null,
            source_role: sourceRole(c.source_role),
            source_authority_note: str(c.source_authority_note),
            link: webUrl(c.link),
            published: str(c.published),
        };
    });
    const m = rec(a.media);
    const media: NewsAlert['media'] = m.kind === 'photo' || m.kind === 'video'
        ? { kind: m.kind, thumb: webUrl(m.thumb), duration: str(m.duration), video: webUrl(m.video), count: numOrNull(m.count) ?? 1 }
        : null;
    const p = rec(a.place);
    const placeName = str(p.name);
    const place: NewsAlert['place'] = placeName && (p.precision === 'settlement' || p.precision === 'region')
        ? { name: placeName, label: str(p.label) ?? placeName, precision: p.precision }
        : null;
    const fwd = rec(a.forwarded_from);
    const fwdName = str(fwd.name);
    const coords = Array.isArray(a.coords) && typeof a.coords[0] === 'number' && typeof a.coords[1] === 'number'
        ? [a.coords[0], a.coords[1]] as [
            number,
            number
        ]
        : null;
    return {
        kind: 'news',
        analysis_allowed: a.analysis_allowed !== false,
        id: str(a.id) ?? str(a.link) ?? title,
        ts,
        title,
        summary,
        text,
        link: webUrl(a.link),
        published,
        source,
        source_name: sourceName,
        lean,
        bloc: isBloc(a.bloc) ? a.bloc : null,
        source_role: sourceRole(a.source_role),
        source_authority_note: str(a.source_authority_note),
        flag: str(a.flag),
        alertKind: a.alert_kind === 'rocket' || a.alert_kind === 'event' ? a.alert_kind : 'news',
        place,
        media,
        forwarded_from: fwdName ? { name: fwdName, url: webUrl(fwd.url) } : null,
        reply_to: webUrl(a.reply_to),
        views: numOrNull(a.views),
        carriers,
        keywords: Array.isArray(a.risk_keywords) ? a.risk_keywords.filter((k): k is string => typeof k === 'string') : [],
        coords,
        anchor: str(a.coords_anchor),
        haystack: `${title} ${summary} ${sourceName} ${lean ?? ''} ${place?.label ?? ''} ${carriers.map(c => c.source_name).join(' ')}`.toLowerCase(),
    };
}
function toQuake(raw: unknown): QuakeAlert | null {
    const eq = rec(raw);
    const magnitude = numOrNull(eq.magnitude);
    const time = numOrNull(eq.time);
    const lat = numOrNull(eq.lat);
    const lng = numOrNull(eq.lng);
    if (magnitude == null || time == null || lat == null || lng == null)
        return null;
    return {
        kind: 'quake',
        id: str(eq.id) ?? `${lat},${lng},${time}`,
        ts: time,
        magnitude,
        place: str(eq.place) ?? 'Unknown location',
        depth: numOrNull(eq.depth),
        url: webUrl(eq.url),
        tsunami: Boolean(eq.tsunami),
        felt: numOrNull(eq.felt),
        pager: str(eq.alert),
        lat,
        lng,
    };
}
export function toWarning(raw: unknown): WarningAlert | null {
    const w = rec(raw);
    const title = str(w.title);
    const lat = numOrNull(w.lat);
    const lng = numOrNull(w.lng);
    if (!title || lat == null || lng == null)
        return null;
    const issued = str(w.date);
    const ts = issued ? Date.parse(issued) : NaN;
    const expires = str(w.expires);
    const severity = w.severity === 'high' || w.severity === 'medium' ? w.severity : 'low';
    const type = str(w.type) ?? str(w.category) ?? 'Warning';
    const area = str(w.area);
    const provider = str(w.provider) ?? 'Official warning';
    return {
        kind: 'warning',
        id: str(w.id) ?? `${title}-${lat},${lng}`,
        /* An issuer that dates nothing is shown as current rather than dropped:
           an active warning is active whether or not it says when it was written. */
        ts: Number.isFinite(ts) ? ts : Date.now(),
        title,
        type,
        severity,
        area,
        expires: expires && Number.isFinite(Date.parse(expires)) ? Date.parse(expires) : null,
        provider,
        url: webUrl(w.source),
        lat,
        lng,
        haystack: `${title} ${type} ${area ?? ''} ${provider}`.toLowerCase(),
    };
}
const SEVERITY_COLORS: Record<WarningAlert['severity'], string> = { high: '#FF3D3D', medium: '#FF9500', low: '#FFD700' };
/** Which of two alerts posted in the same minute a reader needs first. */
export function urgency(item: AlertItem): number {
    if (item.kind === 'warning')
        return item.severity === 'high' ? 4 : item.severity === 'medium' ? 3 : 1;
    if (item.kind === 'quake')
        return item.magnitude >= 6 ? 4 : item.magnitude >= 5 ? 2 : 1;
    return item.flag ? 3 : item.alertKind === 'rocket' ? 2 : 1;
}
const quakeColor = (m: number) => (m >= 6 ? '#FF3D3D' : m >= 5 ? '#FF9500' : m >= 4 ? '#FFD700' : '#9CCC65');
const PAGER_COLORS: Record<string, string> = { green: '#00E676', yellow: '#FFD700', orange: '#FF9500', red: '#FF3D3D' };
const roleColor = (role: SourceRole) => SOURCE_ROLES[role].color;
function compactCount(n: number): string {
    if (n >= 1e6)
        return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3)
        return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
    return String(n);
}
const BUCKETS = [
    { max: 3600000, label: 'LAST HOUR' },
    { max: 6 * 3600000, label: '1–6 HOURS AGO' },
    { max: 24 * 3600000, label: '6–24 HOURS AGO' },
    { max: Infinity, label: 'OLDER' },
];
function Chip({ children, color = '#8A8880', title }: {
    children: ReactNode;
    color?: string;
    title?: string;
}) {
    __useLocale();
    return (<span title={__tv(title)} className="inline-flex items-center gap-1 rounded px-1 py-[1px] text-[8.5px] font-mono uppercase tracking-wider" style={{ color, background: `${color}14`, border: `1px solid ${color}26` }}>
      {__tv(children)}
    </span>);
}
function NewsCard({ item, now, open, wide, onToggle, onLocate }: {
    item: NewsAlert;
    now: number;
    open: boolean;
    wide?: boolean;
    onToggle: () => void;
    onLocate: (lat: number, lng: number, options?: LocateOptions) => void;
}) {
    __useLocale();
    const color = roleColor(item.source_role);
    const fresh = now - item.ts < 15 * 60000;
    const [mediaFailed, setMediaFailed] = useState(false);
    const [videoFailed, setVideoFailed] = useState(false);
    const kind = ALERT_KINDS[item.alertKind];
    const video = item.media?.video && !videoFailed ? item.media.video : null;
    return (<article className={`rounded-lg border border-l-2 transition-colors ${wide ? 'xl:col-span-2' : ''} ${open ? 'bg-[#15151A] border-[#3A3A38]' : 'bg-[#111111]/70 border-[#26262A] hover:bg-[#17171B] hover:border-[#34343A]'}`} style={{ borderLeftColor: color }}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full text-left px-2.5 pt-2 pb-2 outline-none focus-visible:ring-1 focus-visible:ring-white/30 rounded-lg">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[9.5px] font-mono uppercase tracking-wider">
            {__tv(fresh && <span className="w-1.5 h-1.5 rounded-full animate-osiris-pulse" style={{ background: ACCENT }} title={__t("Posted in the last 15 minutes")}/>)}
            <span className="font-semibold text-[#E8E6E0]">{item.source_name}</span>
            <span style={{ color }}>{__t(SOURCE_ROLES[item.source_role].label)}</span>
          </div>
          <time dateTime={item.published} title={new Date(item.ts).toISOString()} className="flex-shrink-0 text-[9.5px] font-mono text-[#8A8880]">
            {__tv(timeAgo(item.ts, now))}
          </time>
        </div>

        <h4 className={`mt-1 font-sans text-[12.5px] font-medium leading-snug text-[#F2EFE8] ${open ? '' : 'line-clamp-3'}`}>
          {__tv(item.flag && <span className="mr-1.5 inline-block translate-y-[-1px] rounded bg-[#FF3D3D]/15 px-1 text-[8.5px] font-mono font-bold tracking-wider text-[#FF6B6B]">{__t("BREAKING")}</span>)}
          {item.title}
        </h4>
        {__tv(!open && item.summary && (<p className="mt-1 font-sans text-[11px] leading-relaxed text-[#9B978E] line-clamp-2">{item.summary}</p>))}

        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {__tv(item.alertKind !== 'news' && <Chip color={kind.color}>{__tv(kind.label)}</Chip>)}
          {__tv(item.place && (<Chip color={kind.color} title={__t("Pinned to {0} \u2014 the place the post names", item.place.label)}>
              <MapPin className="w-2 h-2"/> <span className="max-w-[110px] truncate normal-case">{__tv(item.place.name)}</span>
            </Chip>))}
          {__tv(item.media && (<Chip title={__tv(item.media.count > 1 ? `${item.media.count} media items` : undefined)}>
              {__tv(item.media.kind === 'video' ? <Play className="w-2 h-2"/> : <ImageIcon className="w-2 h-2"/>)}
              {__tv(item.media.kind === 'video' ? (item.media.duration || 'video') : 'photo')}
              {__tv(item.media.count > 1 && ` +${item.media.count - 1}`)}
            </Chip>))}
          {__tv(item.carriers.length > 0 && (<Chip color="#00E5FF" title={__t("Also carried by {0}", item.carriers.map(c => c.source_name).join(', '))}>
              <Layers className="w-2 h-2"/> +{__tv(item.carriers.length)}{__t(" channel")}{__tv(item.carriers.length > 1 ? 's' : '')}
            </Chip>))}
          {__tv(item.forwarded_from && (<Chip title={__t("Forwarded from {0}", item.forwarded_from.name)}>
              <Repeat2 className="w-2 h-2"/> <span className="max-w-[110px] truncate normal-case">{__tv(item.forwarded_from.name)}</span>
            </Chip>))}
          {__tv(item.reply_to && <Chip><CornerDownRight className="w-2 h-2"/>{__t(" reply")}</Chip>)}
          {__tv(item.keywords.slice(0, 2).map(k => (<Chip key={k} color="#FF9500" title={__t("Matched by the conflict-keyword filter \u2014 a word match, not an assessment")}>{__tv(k)}</Chip>)))}
          {__tv(item.views != null && (<span className="ml-auto inline-flex items-center gap-0.5 text-[8.5px] font-mono text-[#5C5A54]" title={__t("{0} views", item.views.toLocaleString())}>
              <Eye className="w-2.5 h-2.5"/> {__tv(compactCount(item.views))}
            </span>))}
        </div>
      </button>

      {__tv(open && (<div className="px-2.5 pb-2.5 space-y-2">
          {__tv(video && (<video src={video} poster={item.media?.thumb ?? undefined} controls playsInline preload="none" onError={() => setVideoFailed(true)} className="block max-h-64 w-full max-w-[560px] rounded-md border border-white/5 bg-black"/>))}

          {__tv(!video && item.media?.thumb && !mediaFailed && (<a href={item.link ?? undefined} target="_blank" rel="noopener noreferrer" className="relative block max-w-[560px] overflow-hidden rounded-md border border-white/5 bg-black/40">
              {/* eslint-disable-next-line @next/next/no-img-element -- remote CDN preview, loaded only on expand */}
              <img src={item.media.thumb} alt={__t("")} loading="lazy" referrerPolicy="no-referrer" onError={() => setMediaFailed(true)} className="max-h-52 w-full object-cover"/>
              {__tv(item.media.kind === 'video' && (<span className="absolute inset-0 flex items-center justify-center bg-black/25">
                  <span className="flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-mono text-white">
                    <Play className="w-3 h-3"/>{__t(" WATCH ON TELEGRAM")}{__tv(item.media.duration ? ` · ${item.media.duration}` : '')}
                  </span>
                </span>))}
            </a>))}

          {__tv(item.summary && (<div className="max-h-56 overflow-y-auto styled-scrollbar pr-1 font-sans text-[11.5px] leading-relaxed text-[#C9C5BC] whitespace-pre-line">
              {item.summary}
            </div>))}

          {__tv(item.forwarded_from && (<div className="text-[10px] font-mono text-[#8A8880]">{__t("Forwarded from")}{__t(" ")}
              {__tv(item.forwarded_from.url
                    ? <a href={item.forwarded_from.url} target="_blank" rel="noopener noreferrer" className="text-[var(--cyan-primary)] hover:underline">{__tv(item.forwarded_from.name)}</a>
                    : <span className="text-[#C9C5BC]">{__tv(item.forwarded_from.name)}</span>)}
            </div>))}

          {__tv(item.carriers.length > 0 && (<div>
              <div className="mb-1 text-[8.5px] font-mono tracking-widest text-[#5C5A54]">{__t("ALSO CARRIED BY")}</div>
              <ul className="space-y-0.5">
                {__tv(item.carriers.map(c => (<li key={c.source} className="flex items-center gap-1.5 text-[10px] font-mono">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: roleColor(c.source_role) }}/>
                    <span className="text-[#C9C5BC]">{c.source_name}</span>
                    <span className="text-[8.5px]" style={{ color: roleColor(c.source_role) }}>{__t(SOURCE_ROLES[c.source_role].label)}</span>
                    <span className="ml-auto flex-shrink-0 text-[#5C5A54]">{__tv(c.published ? timeAgo(c.published, now) : '')}</span>
                    {__tv(c.link && (<a href={c.link} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 text-[var(--cyan-primary)] hover:opacity-70" aria-label={__t("Open {0} post", c.source_name)}>
                        <ExternalLink className="w-2.5 h-2.5"/>
                      </a>))}
                  </li>)))}
              </ul>
            </div>))}

          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/5">
            {__tv(item.link && (<a href={item.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded border border-[var(--cyan-primary)]/30 bg-[var(--cyan-primary)]/10 px-2 py-1 text-[9.5px] font-mono tracking-wider text-[var(--cyan-primary)] hover:bg-[var(--cyan-primary)]/20">
                <ExternalLink className="w-2.5 h-2.5"/>{__t(" OPEN POST")}</a>))}
            {__tv(item.reply_to && (<a href={item.reply_to} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[9.5px] font-mono tracking-wider text-[#9B978E] hover:bg-white/5">
                <CornerDownRight className="w-2.5 h-2.5"/>{__t(" IN REPLY TO")}</a>))}
            {__tv(item.coords && item.place && (<button type="button" onClick={() => onLocate(item.coords![0], item.coords![1], { zoom: item.place!.precision === 'settlement' ? 10 : 7, alertId: item.id })} title={__t("{0} \u2014 the place the post names. Town-level: a post names a place, not an exact spot.", item.place.label)} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[9.5px] font-mono tracking-wider hover:bg-white/5" style={{ color: kind.color, borderColor: `${kind.color}55` }}>
                <MapPin className="w-2.5 h-2.5"/> {__tv(item.place.name.toUpperCase())}
              </button>))}
            {__tv(item.coords && !item.place && (<button type="button" onClick={() => onLocate(item.coords![0], item.coords![1])} title={__tv(item.anchor ? `Approximate: the centroid for "${item.anchor}", not the event location` : 'Approximate location')} className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[9.5px] font-mono tracking-wider text-[#9B978E] hover:bg-white/5">
                <MapPin className="w-2.5 h-2.5"/> ≈ {__tv((item.anchor || 'region').toUpperCase())}
              </button>))}
            <span className="text-[9px] text-[#A9A59B]">{__tv(item.source_authority_note ?? "Source role does not establish independent verification.")}</span>
          </div>
        </div>))}
    </article>);
}
/** The quote after the speaker label; in full, the whole post body after it. */
function quoteOf(item: NewsAlert, speaker: string, full: boolean): string {
    if (!full)
        return item.title.slice(speaker.length + 2);
    const colon = item.text.search(/:\s/);
    return colon >= 0
        ? item.text.slice(colon + 1).trim()
        : [item.title.slice(speaker.length + 2), item.summary].filter(Boolean).join('\n');
}
function StatementCard({ speaker, items, now, open, wide, onToggle }: {
    speaker: string;
    items: NewsAlert[];
    now: number;
    open: boolean;
    wide?: boolean;
    onToggle: () => void;
}) {
    __useLocale();
    const lead = items[0];
    const color = roleColor(lead.source_role);
    const fresh = now - lead.ts < 15 * 60000;
    return (<article className={`rounded-lg border border-l-2 transition-colors ${wide ? 'xl:col-span-2' : ''} ${open ? 'bg-[#15151A] border-[#3A3A38]' : 'bg-[#111111]/70 border-[#26262A] hover:bg-[#17171B] hover:border-[#34343A]'}`} style={{ borderLeftColor: color }}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full text-left px-2.5 pt-2 pb-1.5 outline-none focus-visible:ring-1 focus-visible:ring-white/30 rounded-lg">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[9.5px] font-mono uppercase tracking-wider">
            {__tv(fresh && <span className="w-1.5 h-1.5 rounded-full animate-osiris-pulse" style={{ background: ACCENT }} title={__t("Posted in the last 15 minutes")}/>)}
            <span className="font-semibold text-[#E8E6E0]">{lead.source_name}</span>
            <span style={{ color }}>{__t(SOURCE_ROLES[lead.source_role].label)}</span>
          </div>
          <time dateTime={lead.published} title={__tv(new Date(lead.ts).toLocaleString())} className="flex-shrink-0 text-[9.5px] font-mono text-[#8A8880]">
            {__tv(timeAgo(lead.ts, now))}
          </time>
        </div>
        <h4 className="mt-1 font-sans text-[12.5px] font-medium leading-snug text-[#F2EFE8]">
          {__tv(items.some(i => i.flag) && <span className="mr-1.5 inline-block translate-y-[-1px] rounded bg-[#FF3D3D]/15 px-1 text-[8.5px] font-mono font-bold tracking-wider text-[#FF6B6B]">{__t("BREAKING")}</span>)}
          {__tv(speaker)}
          <span className="ml-1.5 whitespace-nowrap text-[9px] font-mono font-normal tracking-wider text-[#8A8880]">{__tv(items.length)}{__t(" STATEMENTS")}</span>
        </h4>
      </button>
      <ol className="px-2.5 pb-2 space-y-1">
        {__tv(items.map(item => (<li key={item.id} className="flex items-start gap-1.5 border-l border-white/10 pl-2">
            <p className={`flex-1 min-w-0 font-sans text-[11px] leading-relaxed text-[#C9C5BC] whitespace-pre-line ${open ? '' : 'line-clamp-2'}`}>
              {__tv(quoteOf(item, speaker, open))}
            </p>
            <span className="flex flex-shrink-0 items-center gap-1 pt-0.5 text-[9px] font-mono text-[#5C5A54]">
              {__tv(item.media && (item.media.kind === 'video' ? <Play className="w-2.5 h-2.5"/> : <ImageIcon className="w-2.5 h-2.5"/>))}
              {__tv(timeAgo(item.ts, now).replace(' ago', ''))}
              {__tv(item.link && (<a href={item.link} target="_blank" rel="noopener noreferrer" className="text-[var(--cyan-primary)] hover:opacity-70" aria-label={__t("Open this statement on Telegram")}>
                  <ExternalLink className="w-2.5 h-2.5"/>
                </a>))}
            </span>
          </li>)))}
      </ol>
    </article>);
}
function QuakeCard({ item, now, onLocate }: {
    item: QuakeAlert;
    now: number;
    onLocate: (lat: number, lng: number) => void;
}) {
    __useLocale();
    const color = quakeColor(item.magnitude);
    return (<article className="rounded-lg border border-[#26262A] border-l-2 bg-[#111111]/70 hover:bg-[#17171B] transition-colors" style={{ borderLeftColor: color }}>
      <div className="flex items-center gap-2.5 px-2.5 py-2">
        <button type="button" onClick={() => onLocate(item.lat, item.lng)} title={__t("Show on map")} className="flex h-10 w-10 flex-shrink-0 flex-col items-center justify-center rounded-md font-mono transition-transform hover:scale-105" style={{ background: `${color}1c`, border: `1px solid ${color}55`, color }}>
          <span className="text-[13px] font-bold leading-none">{__tv(item.magnitude.toFixed(1))}</span>
          <span className="mt-0.5 text-[7px] tracking-widest">{__t("MAG")}</span>
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-sans text-[12px] leading-snug text-[#F2EFE8] line-clamp-2">{__tv(item.place)}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[9.5px] font-mono text-[#8A8880]">
            <time dateTime={new Date(item.ts).toISOString()} title={__tv(new Date(item.ts).toLocaleString())}>{__tv(timeAgo(item.ts, now))}</time>
            {__tv(item.depth != null && <span>· {__tv(Math.round(item.depth))}{__t(" km deep")}</span>)}
            {__tv(item.felt ? <span>{__t("\u00B7 felt by ")}{__tv(item.felt.toLocaleString())}</span> : null)}
          </div>
          {__tv((item.tsunami || item.pager) && (<div className="mt-1 flex flex-wrap gap-1">
              {__tv(item.tsunami && <Chip color="#448AFF"><Waves className="w-2 h-2"/>{__t(" tsunami flag")}</Chip>)}
              {__tv(item.pager && <Chip color={PAGER_COLORS[item.pager] || '#8A8880'} title={__t("USGS PAGER impact alert level")}>{__t("PAGER ")}{__tv(item.pager)}</Chip>)}
            </div>))}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <button type="button" onClick={() => onLocate(item.lat, item.lng)} className="p-1 rounded text-[#8A8880] hover:text-white hover:bg-white/10" aria-label={__t("Show on map")}>
            <MapPin className="w-3 h-3"/>
          </button>
          {__tv(item.url && (<a href={item.url} target="_blank" rel="noopener noreferrer" className="p-1 rounded text-[var(--cyan-primary)] hover:bg-white/10" aria-label={__t("Open USGS event page")}>
              <ExternalLink className="w-3 h-3"/>
            </a>))}
        </div>
      </div>
    </article>);
}
/** How long a warning has left to run, as its issuer states it. */
export function expiryLabel(expires: number, now: number): string | null {
    const left = expires - now;
    if (left <= 0)
        return 'expired';
    const hours = left / 3600000;
    if (hours < 1)
        return `${Math.max(1, Math.round(left / 60000))} min left`;
    if (hours < 48)
        return `${Math.round(hours)}h left`;
    return `${Math.round(hours / 24)}d left`;
}
function WarningCard({ item, now, onLocate }: {
    item: WarningAlert;
    now: number;
    onLocate: (lat: number, lng: number, options?: LocateOptions) => void;
}) {
    __useLocale();
    const color = SEVERITY_COLORS[item.severity];
    const left = item.expires != null ? expiryLabel(item.expires, now) : null;
    return (<article className="rounded-lg border border-[#26262A] border-l-2 bg-[#111111]/70 hover:bg-[#17171B] transition-colors" style={{ borderLeftColor: color }}>
      <div className="px-2.5 py-2">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[9.5px] font-mono uppercase tracking-wider">
            <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" style={{ color }}/>
            <span className="font-semibold" style={{ color }}>{__tv(item.type)}</span>
            <span className="text-[#8A8880]">{__tv(item.provider)}</span>
          </div>
          <time dateTime={new Date(item.ts).toISOString()} title={__tv(new Date(item.ts).toLocaleString())} className="flex-shrink-0 text-[9.5px] font-mono text-[#8A8880]">
            {__tv(timeAgo(item.ts, now))}
          </time>
        </div>

        <p className="mt-1 font-sans text-[12px] leading-snug text-[#F2EFE8] line-clamp-3">{item.title}</p>

        {__tv(item.area && (<p className="mt-1 font-sans text-[10.5px] leading-snug text-[#9B978E] line-clamp-2" title={__tv(item.area)}>{__tv(item.area)}</p>))}

        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <Chip color={color} title={__t("As the issuer graded it")}>{__tv(item.severity)}{__t(" severity")}</Chip>
          {__tv(left && <Chip color={left === 'expired' ? '#5C5A54' : '#8A8880'} title={__t("Runs until {0}", new Date(item.expires!).toLocaleString())}>{__tv(left)}</Chip>)}
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => onLocate(item.lat, item.lng, { zoom: 6 })} title={__t("Show where this was issued")} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[9.5px] font-mono tracking-wider hover:bg-white/5" style={{ color, borderColor: `${color}55` }}>
              <MapPin className="w-2.5 h-2.5"/>{__t(" SHOW")}</button>
            {__tv(item.url && (<a href={item.url} target="_blank" rel="noopener noreferrer" className="p-1 rounded text-[var(--cyan-primary)] hover:bg-white/10" aria-label={__t("Open the {0} notice", item.provider)}>
                <ExternalLink className="w-3 h-3"/>
              </a>))}
          </div>
        </div>
      </div>
    </article>);
}
export function SourcePanel({ sources, excluded }: { sources: SourceHealth[]; excluded: ExcludedSource[] }) {
    const { locale } = __useLocale();
    const timestamp = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value))
        ? `${new Date(value).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-GB', { timeZone: 'Asia/Shanghai', hourCycle: 'h23' })} (UTC+8)`
        : __t('Unknown');
    const statusLabels = { ok: 'Check successful', empty: 'Valid empty result', stale: 'Stale records retained', unavailable: 'Unavailable' };
    return (<details className="rounded-md border border-[#CFB87C]/25 bg-[#CFB87C]/[0.04] text-[10px] leading-relaxed text-[#C9C5BC]">
      <summary className="cursor-pointer px-2 py-1.5 font-medium text-[#CFB87C] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#CFB87C]">{__t('Sources and humanitarian standards')}</summary>
      <div className="max-h-72 space-y-3 overflow-y-auto px-2 pb-2 styled-scrollbar">
        <p>{__t('Civilian protection, humanitarian access and essential services receive the same standard of care for everyone affected by war.')}</p>
        <p>{__t('Reports remain attributed to their publishers. UN reporting is not automatically a Security Council decision or independent verification.')}</p>
        <div>
          <h5 className="font-medium text-[#E8E6E0]">{__t('Security Council reference documents')}</h5>
          <ul className="mt-1 space-y-1">
            {UNSC_REFERENCES.map(reference => <li key={reference.url}><a href={reference.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#CFB87C] underline underline-offset-2"><ExternalLink className="h-2.5 w-2.5"/>{__t(reference.label)}</a></li>)}
          </ul>
          <p className="mt-1 text-[#A9A59B]">{__t('Reference links do not confirm individual headlines. No linked Council decision does not mean an event did not occur.')}</p>
        </div>
        <p>{__t('Source checks are independent of the number of reports. Missing or failed data does not establish safe conditions.')}</p>
        {sources.length === 0 && <p role="status">{__t('Source status is unknown until a source report is available.')}</p>}
        {SOURCE_ROLE_ORDER.map(role => {
            const group = sources.filter(source => sourceRole(source.source_role) === role);
            return group.length > 0 && <section key={role}>
              <h5 className="mb-1 font-medium" style={{ color: SOURCE_ROLES[role].color }}>{__t(SOURCE_ROLES[role].label)}</h5>
              <ul className="space-y-2">{group.map(source => <li key={source.id ?? source.handle} className="rounded border border-white/10 p-2 break-words">
                <div className="flex flex-wrap justify-between gap-x-2"><strong className="text-[#E8E6E0]">{source.name}</strong><span>{__t('{0} records', source.count)}</span></div>
                <p className={source.stale || source.status === 'unavailable' ? 'text-[#FFB76B]' : 'text-[#C9C5BC]'}>{__t((source.status ? statusLabels[source.status] : undefined) ?? 'Status unknown')}{source.stale && source.status !== 'stale' ? ` · ${__t('Stale records retained')}` : ''}</p>
                {source.authority_note && <p className="mt-1">{__tv(source.authority_note)}</p>}
                {source.analysis_allowed === false && <p className="mt-1 text-[#CFB87C]">{__t('Display only; excluded from automated analysis.')}</p>}
                <dl className="mt-1 space-y-0.5 text-[9px] text-[#A9A59B]">
                  <div><dt className="inline">{__t('Last attempt')}: </dt><dd className="inline">{timestamp(source.last_attempt_at)}</dd></div>
                  <div><dt className="inline">{__t('Last retrieval')}: </dt><dd className="inline">{timestamp(source.last_success_at)}</dd></div>
                  <div><dt className="inline">{__t('Last check')}: </dt><dd className="inline">{timestamp(source.last_checked_at)}</dd></div>
                  <div><dt className="inline">{__t('Latest source publication')}: </dt><dd className="inline">{timestamp(source.latest)}</dd></div>
                </dl>
                {source.error && <p className="mt-1 text-[#FFB76B]">{__t('Collection issue')}: {__tv(source.error)}</p>}
              </li>)}</ul>
            </section>;
        })}
        {excluded.length > 0 && <details><summary className="cursor-pointer text-[#A9A59B]">{__t('{0} sources not admitted', excluded.length)}</summary><ul className="mt-1 space-y-1">{excluded.map(source => <li key={source.id}><strong>{source.name}</strong>: {__tv(source.admission_reason)}</li>)}</ul></details>}
      </div>
    </details>);
}
export default function LiveAlerts({ data, onLocate, onRefresh, pinsOn = false, onTogglePins, onPinnedChange }: LiveAlertsProps) {
    __useLocale();
    const [expanded, setExpanded] = useState(true);
    const [maximized, setMaximized] = useState(false);
    const [tab, setTab] = useState<Tab>('all');
    const [query, setQuery] = useState('');
    const [role, setRole] = useState<SourceRole | 'all'>('all');
    const [threadId, setThreadId] = useState<string | null>(null);
    /** Set from the "right now" strip: show only rocket reports, or only breaking ones. */
    const [newsKind, setNewsKind] = useState<'rocket' | 'breaking' | null>(null);
    const [openId, setOpenId] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [overviewOpen, setOverviewOpen] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const maximizeRef = useRef<HTMLButtonElement>(null);
    const [now, setNow] = useState(() => Date.now());
    // Relative times ("12m ago") stay current while the panel is open.
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(t);
    }, []);
    useEffect(() => {
        if (!maximized)
            return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const focusable = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, summary, [tabindex="0"]') ?? []).filter(element => element.getClientRects().length > 0);
        focusable()[0]?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); setMaximized(false); }
            if (e.key === 'Tab') {
                const elements = focusable();
                const first = elements[0];
                const last = elements[elements.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = previousOverflow; requestAnimationFrame(() => maximizeRef.current?.focus()); };
    }, [maximized]);
    const news = useMemo(() => (data.news ?? []).map(toNews).filter((n): n is NewsAlert => n !== null).sort((a, b) => b.ts - a.ts), [data.news]);
    const quakes = useMemo(() => (data.earthquakes ?? []).map(toQuake).filter((q): q is QuakeAlert => q !== null).sort((a, b) => b.ts - a.ts).slice(0, 15), [data.earthquakes]);
    /* Official warnings, gravest first and then newest: a tornado warning
       outranks a coastal flood statement however recently either was issued. */
    const warnings = useMemo(() => {
        const rank = { high: 0, medium: 1, low: 2 };
        return (data.weather_events ?? [])
            .map(toWarning)
            .filter((w): w is WarningAlert => w !== null)
            .sort((a, b) => rank[a.severity] - rank[b.severity] || b.ts - a.ts);
    }, [data.weather_events]);
    const digestReports = useMemo<(DigestReport & { source_id?: string })[]>(() => {
        const sourceById = new Map((data.news ?? []).map(raw => {
            const record = rec(raw);
            return [str(record.id), str(record.source_id)] as const;
        }));
        return news.map(n => ({
        id: n.id,
        analysis_allowed: n.analysis_allowed,
        source_id: sourceById.get(n.id) || undefined,
        title: n.title,
        text: n.text.slice(0, 600),
        source: n.source,
        source_name: n.source_name,
        bloc: n.bloc,
        source_role: n.source_role,
        source_authority_note: n.source_authority_note,
        published: n.published,
        link: n.link,
        flag: n.flag,
        views: n.views,
        also_reported_by: n.carriers.map(c => ({ source: c.source, source_name: c.source_name, bloc: c.bloc, source_role: c.source_role })),
    }));
    }, [news, data.news]);
    const threads = useMemo(() => buildThreads(digestReports, 8), [digestReports]);
    const activeThread = threads.find(t => t.id === threadId) ?? null;
    // Only what the overview reads — not the whole dashboard state.
    const overviewPayload = useMemo(() => ({
        news: digestReports,
        news_meta: data.news_meta,
        earthquakes: quakes.map(q => ({ magnitude: q.magnitude, place: q.place, time: q.ts, tsunami: q.tsunami ? 1 : 0, url: q.url })),
        weather_events: (data.weather_events ?? []).slice(0, 100).map(w => ({ type: str(rec(w).type), severity: str(rec(w).severity) })),
    }), [digestReports, quakes, data.weather_events, data.news_meta]);
    const sourceHealthSignature = (data.news_meta?.sources ?? []).map(source => `${source.id ?? source.handle}:${source.status ?? 'unknown'}:${source.stale ?? 'unknown'}`).join('|');
    const signature = `${news[0]?.id ?? ''}|${news.length}|${quakes[0]?.id ?? ''}|${sourceHealthSignature}`;
    const q = query.trim().toLowerCase();
    // A new tab or filter starts at the top, not wherever the last list was scrolled to.
    useEffect(() => { listRef.current?.scrollTo({ top: 0 }); }, [tab, role, threadId, q]);
    const newsFiltersActive = Boolean(activeThread) || role !== 'all' || newsKind !== null;
    const threadIds = useMemo(() => (activeThread ? new Set(activeThread.itemIds) : null), [activeThread]);
    const visibleNews = useMemo(() => news.filter(n => (!threadIds || threadIds.has(n.id))
        && (role === 'all' || n.source_role === role || n.carriers.some(c => c.source_role === role))
        && (newsKind === null || (newsKind === 'rocket' ? n.alertKind === 'rocket' : Boolean(n.flag)))
        && (!q || n.haystack.includes(q))), [news, threadIds, role, newsKind, q]);
    const visibleQuakes = useMemo(() => quakes.filter(k => !q || k.place.toLowerCase().includes(q)), [quakes, q]);
    const visibleWarnings = useMemo(() => warnings.filter(w => !q || w.haystack.includes(q)), [warnings, q]);
    const list: AlertItem[] = useMemo(() => {
        if (tab === 'news')
            return visibleNews;
        if (tab === 'warnings')
            return visibleWarnings;
        if (tab === 'quakes')
            return visibleQuakes;
        if (tab === 'feeds')
            return [];
        /* Thread and perspective filters are about reports; warnings and quakes
           step aside while they apply. In the mixed list a severe warning leads
           its hour, since that is the one a reader has to act on. */
        if (newsFiltersActive)
            return visibleNews;
        return [...visibleNews, ...visibleQuakes, ...visibleWarnings]
            .sort((a, b) => b.ts - a.ts || urgency(b) - urgency(a));
    }, [tab, visibleNews, visibleQuakes, visibleWarnings, newsFiltersActive]);
    /* The reports the filters leave showing that have a place — what the map pins. */
    const pinned = useMemo(() => (tab === 'quakes' || tab === 'feeds' ? [] : visibleNews.filter(n => n.place && n.coords)), [tab, visibleNews]);
    const pinnedKey = pinned.map(n => n.id).join(',');
    useEffect(() => {
        onPinnedChange?.(pinnedKey ? pinnedKey.split(',') : []);
    }, [pinnedKey, onPinnedChange]);
    const units = useMemo<Unit[]>(() => groupStatements(list.map(item => ({
        item,
        analysis_allowed: item.kind !== 'news' || item.analysis_allowed,
        // Only reports form statements; a unique source keeps the rest apart.
        source: item.kind === 'news' ? item.source : `${item.kind}:${item.id}`,
        title: item.kind === 'news' ? item.title : '',
        ts: item.ts,
    }))).map((g): Unit => (g.speaker && g.items.length > 1
        ? { kind: 'statement', key: `stmt:${g.items[0].item.id}`, ts: g.items[0].ts, speaker: g.speaker, items: g.items.map(x => x.item as NewsAlert) }
        : { kind: 'item', key: g.items[0].item.id, ts: g.items[0].ts, item: g.items[0].item })), [list]);
    /* Headings follow the order the list is in: warnings are ranked by how grave
       they are, everything else by when it landed. Heading by time a list that
       is not in time order splits one hour into several headings. */
    const grouped = useMemo(() => {
        const severityLabel = { high: 'SEVERE', medium: 'MODERATE', low: 'ADVISORY' };
        const out: {
            label: string;
            units: Unit[];
        }[] = [];
        for (const unit of units) {
            const item = unit.kind === 'item' ? unit.item : null;
            const label = tab === 'warnings' && item?.kind === 'warning'
                ? severityLabel[item.severity]
                : BUCKETS.find(b => now - unit.ts < b.max)!.label;
            const last = out[out.length - 1];
            if (last?.label === label)
                last.units.push(unit);
            else
                out.push({ label, units: [unit] });
        }
        return out;
    }, [units, now, tab]);
    const sources: SourceHealth[] = data.news_meta?.sources ?? [];
    const liveSources = sources.filter(s => (s.status === 'ok' || s.status === 'empty') && !s.stale).length;
    const fetchedAt: string | null = data.news_meta?.fetchedAt ?? null;
    const breakingCount = news.filter(n => n.flag).length;
    const loading = data.news === undefined;
    const filtersActive = newsFiltersActive || Boolean(q);
    const clearFilters = useCallback(() => { setQuery(''); setRole('all'); setThreadId(null); setNewsKind(null); }, []);
    /*
     * What a reader would want to know before reading anything: warnings in
     * force, rockets in the air, what a channel has flagged as breaking, and the
     * largest quake of the day. Each one is a filter, because the next thing
     * anybody does with that number is go and look at it.
     */
    const rightNow = useMemo(() => {
        const severe = warnings.filter(w => w.severity === 'high').length;
        const rockets = news.filter(n => n.alertKind === 'rocket' && now - n.ts < 6 * 3600000).length;
        const breaking = news.filter(n => n.flag && now - n.ts < 6 * 3600000).length;
        const biggest = quakes.reduce<QuakeAlert | null>((top, q) => (!top || q.magnitude > top.magnitude ? q : top), null);
        return { severe, rockets, breaking, biggest };
    }, [warnings, news, quakes, now]);
    const refresh = useCallback(async () => {
        if (!onRefresh || refreshing)
            return;
        setRefreshing(true);
        try {
            await onRefresh();
        }
        finally {
            setRefreshing(false);
            setNow(Date.now());
        }
    }, [onRefresh, refreshing]);
    const selectThread = useCallback((id: string | null) => {
        setThreadId(id);
        if (id && tab !== 'all' && tab !== 'news')
            setTab('news');
    }, [tab]);
    const locate = useCallback((lat: number, lng: number, options?: LocateOptions) => {
        if (maximized)
            setMaximized(false);
        onLocate(lat, lng, options);
    }, [maximized, onLocate]);
    const tabs: {
        id: Tab;
        label: string;
        count: number;
    }[] = [
        { id: 'all', label: 'ALL', count: news.length + quakes.length + warnings.length },
        { id: 'news', label: 'NEWS', count: news.length },
        { id: 'warnings', label: 'WARN', count: warnings.length },
        { id: 'quakes', label: 'QUAKE', count: quakes.length },
        { id: 'feeds', label: 'BROADCASTS', count: 0 },
    ];
    /* Rocket and breaking are filters over reports; leaving one set while the
       panel shows warnings would label the list with a filter it is not using. */
    const selectTab = useCallback((id: Tab) => {
        setTab(id);
        if (id !== 'news' && id !== 'all')
            setNewsKind(null);
    }, []);
    const nowStats: {
        key: string;
        label: string;
        value: string;
        color: string;
        title: string;
        onClick: () => void;
    }[] = [
        { key: 'severe', label: 'SEVERE', value: String(rightNow.severe), color: SEVERITY_COLORS.high, title: 'Warnings in force that their issuer graded severe or extreme', onClick: () => { selectTab('warnings'); setQuery(''); } },
        { key: 'rocket', label: 'ROCKET', value: String(rightNow.rockets), color: ALERT_KINDS.rocket.color, title: 'Reports of rockets or missiles in the last six hours', onClick: () => { selectTab('news'); setNewsKind(newsKind === 'rocket' ? null : 'rocket'); } },
        { key: 'breaking', label: 'BREAKING', value: String(rightNow.breaking), color: ACCENT, title: 'Reports a channel flagged as breaking in the last six hours', onClick: () => { selectTab('news'); setNewsKind(newsKind === 'breaking' ? null : 'breaking'); } },
        ...(rightNow.biggest ? [{
                key: 'quake',
                label: 'QUAKE',
                value: `M${rightNow.biggest.magnitude.toFixed(1)}`,
                color: quakeColor(rightNow.biggest.magnitude),
                title: `Largest earthquake in the last day — ${rightNow.biggest.place}`,
                onClick: () => selectTab('quakes'),
            }] : []),
    ];
    const controls = (<div className={`space-y-2 ${maximized ? '' : 'px-3 pt-2'}`}>
      {/* What needs attention right now */}
      <div className="flex gap-1">
        {__tv(nowStats.map(stat => {
            const active = (stat.key === 'rocket' && newsKind === 'rocket')
                || (stat.key === 'breaking' && newsKind === 'breaking')
                || (stat.key === 'severe' && tab === 'warnings')
                || (stat.key === 'quake' && tab === 'quakes');
            const quiet = stat.value === '0';
            return (<button key={stat.key} type="button" onClick={stat.onClick} title={__tv(stat.title)} aria-pressed={active} className={`flex-1 rounded border px-1 py-1 text-center transition-colors ${active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`} style={{ borderColor: quiet ? '#26262A' : `${stat.color}55` }}>
              <div className="text-[12px] font-mono font-bold leading-none tabular-nums" style={{ color: quiet ? '#5C5A54' : stat.color }}>{__tv(stat.value)}</div>
              <div className="mt-0.5 text-[7.5px] font-mono tracking-widest text-[#8A8880]">{__tv(stat.label)}</div>
            </button>);
        }))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1" role="tablist">
        {__tv(tabs.map(t => (<button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => selectTab(t.id)} className={`flex-1 rounded px-1.5 py-1 text-[10px] font-mono tracking-wider transition-all ${tab === t.id ? 'bg-[var(--cyan-primary)]/15 text-[var(--cyan-primary)] border border-[var(--cyan-primary)]/45' : 'text-[#8A8880] border border-transparent hover:text-[#E8E6E0] hover:bg-[#2A2A28]'}`}>
            {__tv(t.label)} <span className="opacity-60 tabular-nums">{__tv(t.count)}</span>
          </button>)))}
      </div>

      {/* Search and source role */}
      <div className="flex gap-1.5">
        <label className="relative flex-1 min-w-0">
          <span className="sr-only">{__t("Search alerts")}</span>
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[#5C5A54]"/>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder={__t('Search headlines, places, sources…')} className="w-full rounded border border-[#2A2A28] bg-black/30 py-1 pl-6 pr-6 text-[11px] text-[#E8E6E0] placeholder:text-[#5C5A54] outline-none focus:border-[var(--cyan-primary)]/50"/>
          {__tv(query && (<button onClick={() => setQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#5C5A54] hover:text-white" aria-label={__t("Clear search")}>
              <X className="h-3 w-3"/>
            </button>))}
        </label>
        {__tv(tab !== 'quakes' && tab !== 'warnings' && tab !== 'feeds' && (<select value={role} onChange={e => setRole(e.target.value as SourceRole | 'all')} aria-label={__t("Filter by source role")} className="w-[125px] flex-shrink-0 rounded border border-[#2A2A28] bg-[#0c0c10] px-1 py-1 text-[10px] font-mono text-[#C9C5BC] outline-none focus:border-[var(--cyan-primary)]/50">
            <option value="all">{__t("All source roles")}</option>
            {SOURCE_ROLE_ORDER.map(r => <option key={r} value={r}>{__t(SOURCE_ROLES[r].label)}</option>)}
          </select>))}
      </div>

      <SourcePanel sources={sources} excluded={data.news_meta?.excluded_sources ?? []}/>

      {/* One-click AI overview of the current alert picture */}
      {__tv(tab !== 'feeds' && tab !== 'warnings' && (<div className={maximized ? '' : 'max-h-[240px] overflow-y-auto styled-scrollbar pr-0.5'}>
          <AiOverview mode="alerts" payload={overviewPayload} signature={signature} accent={ACCENT} activeThreadId={threadId} onThreadSelect={selectThread} onOpenChange={setOverviewOpen}/>
        </div>))}

      {/* Threads: the same clustering the overview uses, available without a click */}
      {__tv(tab !== 'quakes' && tab !== 'warnings' && tab !== 'feeds' && threads.length > 0 && !overviewOpen && (<div className={maximized ? 'flex flex-wrap gap-1' : '-mx-3 flex gap-1 overflow-x-auto px-3 pb-0.5 styled-scrollbar'}>
          {__tv(threads.map(t => {
                const active = t.id === threadId;
                const dot = ACCENT;
                return (<button key={t.id} onClick={() => selectThread(active ? null : t.id)} aria-pressed={active} title={__t("{0} reports from {1} channels{2}", t.count, t.sources.length, t.topics.length ? ` — ${t.topics.join(', ')}` : '')} className={`flex flex-shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[9.5px] font-mono whitespace-nowrap transition-colors ${active ? 'text-white' : 'text-[#9B978E] hover:text-[#E8E6E0] border-[#2A2A28] hover:border-[#3A3A38]'}`} style={active ? { borderColor: `${ACCENT}99`, background: `${ACCENT}22` } : undefined}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }}/>
                {__tv(t.label)}
                <span className="tabular-nums opacity-60">{__tv(t.count)}</span>
              </button>);
            }))}
        </div>))}

      {__tv(filtersActive && tab !== 'feeds' && (<div className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] px-2 py-1 text-[9.5px] font-mono text-[#8A8880]">
          <span className="truncate">{__t("SHOWING ")}{__tv(list.length)}{__tv(activeThread ? ` · ${activeThread.label.toUpperCase()}` : '')}{__tv(role !== 'all' ? ` · ${__t(SOURCE_ROLES[role].label)}` : '')}{__tv(newsKind ? ` · ${newsKind.toUpperCase()} ONLY` : '')}
          </span>
          <button onClick={clearFilters} className="flex-shrink-0 text-[var(--cyan-primary)] hover:underline">{__t("CLEAR")}</button>
        </div>))}
    </div>);
    const listBody = tab === 'feeds' ? (<section className="space-y-3 py-3 text-[11px] leading-relaxed text-[#C9C5BC]">
      <h4 className="font-semibold text-[#E8E6E0]">{__t("No live broadcasts admitted")}</h4>
      <p>{__t("Channel identity, English-language coverage, availability and embedding rights must be checked before a broadcast appears here.")}</p>
      <a href="https://webtv.un.org/en" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#CFB87C] underline underline-offset-4"><ExternalLink className="h-3 w-3"/>{__t("Open official UN Web TV")}</a>
      <p className="text-[10px] text-[#A9A59B]">{__t("Official reference link only; no live stream is embedded or verified here.")}</p>
    </section>) : loading ? (<div className="space-y-2" aria-busy="true">
      {__tv([0, 1, 2].map(i => (<div key={i} className="h-[74px] animate-pulse rounded-lg border border-[#26262A] bg-[#111111]/60"/>)))}
      <div className="text-center text-[10px] font-mono text-[#5C5A54]">{__t("READING SOURCES…")}</div>
    </div>) : list.length === 0 ? (filtersActive
        ? <EmptyState text={__t("No alerts match these filters")} onClear={clearFilters}/>
        : <EmptyState text={__tv(tab === 'quakes' ? 'No earthquake records in this snapshot; this does not establish safe conditions.' : tab === 'warnings' ? 'No warning records in this snapshot; this does not establish safe conditions.' : liveSources === sources.length && sources.length > 0 ? 'No reports in the current feed window. Missing data does not establish safe conditions.' : 'No reports available. Source checks are incomplete or failed; conditions are unknown.')} onRetry={onRefresh ? refresh : undefined}/>) : (<div className="space-y-3">
      {__tv(grouped.map(group => (<section key={group.label}>
          <h5 className={`sticky top-0 z-10 -mx-1 mb-1.5 px-1 py-1 text-[8.5px] font-mono tracking-widest text-[#5C5A54] backdrop-blur-md ${maximized ? 'bg-[#0a0a09]/90' : 'bg-[#08080c]/80'}`}>
            {__tv(group.label)} <span className="opacity-60">· {__tv(group.units.reduce((n, u) => n + (u.kind === 'statement' ? u.items.length : 1), 0))}</span>
          </h5>
          <div className={maximized ? 'grid gap-2 grid-cols-1 xl:grid-cols-2 items-start' : 'space-y-2'}>
            {__tv(group.units.map(unit => {
                if (unit.kind === 'statement') {
                    return (<StatementCard key={unit.key} speaker={unit.speaker} items={unit.items} now={now} open={openId === unit.key} wide={maximized && openId === unit.key} onToggle={() => setOpenId(openId === unit.key ? null : unit.key)}/>);
                }
                const item = unit.item;
                if (item.kind === 'warning')
                    return <WarningCard key={item.id} item={item} now={now} onLocate={locate}/>;
                if (item.kind === 'quake')
                    return <QuakeCard key={item.id} item={item} now={now} onLocate={locate}/>;
                return (<NewsCard key={item.id} item={item} now={now} open={openId === item.id} wide={maximized && openId === item.id} onToggle={() => setOpenId(openId === item.id ? null : item.id)} onLocate={locate}/>);
            }))}
          </div>
        </section>)))}
    </div>);
    const content = (<motion.div ref={panelRef} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15, duration: 0.4 }} role={maximized ? 'dialog' : undefined} aria-modal={maximized ? true : undefined} aria-label={__tv(maximized ? 'Live alerts' : undefined)} className={`glass-panel flex flex-col overflow-hidden pointer-events-auto transition-all duration-300 ${maximized ? 'fixed inset-4 z-[9999] bg-[#0a0a09]/95 backdrop-blur-3xl' : 'shrink-0 h-[560px] max-h-[82vh] resize-y'}`}>
      {/* Header: title and controls, then a status line */}
      <div className="flex-shrink-0 border-b border-[rgba(255,255,255,0.05)] bg-[rgba(0,0,0,0.3)]">
        <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
          <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} className="flex min-w-0 items-center gap-2 outline-none">
            <Radio className="w-3.5 h-3.5 flex-shrink-0" style={{ color: ACCENT }}/>
            <span className="hud-text whitespace-nowrap text-[11px] text-[var(--text-primary)]">{__t("LIVE ALERTS")}</span>
            <span className="gotham-tag gotham-tag--high" style={{ fontSize: '9px', padding: '1px 5px' }}>{__tv(news.length + quakes.length)}</span>
          </button>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {__tv(onTogglePins && (<button onClick={() => onTogglePins(!pinsOn)} aria-pressed={pinsOn} className={`flex items-center gap-0.5 rounded px-1 py-1 transition-colors ${pinsOn ? 'text-[#FF4081] hover:bg-[#FF4081]/15' : 'text-[var(--text-muted)] hover:bg-white/10'}`} title={__tv(pinsOn
                ? `${pinned.length} of these reports are pinned on the map — click to hide the pins`
                : 'Pin these reports on the map')} aria-label={__tv(pinsOn ? 'Hide alert pins on the map' : 'Show alert pins on the map')}>
                <MapPin className="w-3 h-3"/>
                <span className="text-[9px] font-mono tabular-nums">{__tv(pinned.length)}</span>
              </button>))}
            {__tv(onRefresh && (<button onClick={refresh} disabled={refreshing} className="p-1 rounded hover:bg-white/10 transition-colors" title={__t("Refresh source snapshots")} aria-label={__t("Refresh alerts")}>
                <RefreshCw className={`w-3 h-3 text-[var(--text-muted)] ${refreshing ? 'animate-spin' : ''}`}/>
              </button>))}
            <button ref={maximizeRef} onClick={() => { setMaximized(!maximized); if (!expanded)
        setExpanded(true); }} className="p-1 rounded hover:bg-white/10 transition-colors" title={__tv(maximized ? 'Restore (Esc)' : 'Maximize')} aria-label={__tv(maximized ? 'Restore panel' : 'Maximize panel')}>
              {__tv(maximized ? <Minimize2 className="w-3 h-3 text-[var(--text-muted)]"/> : <Maximize2 className="w-3 h-3 text-[var(--text-muted)]"/>)}
            </button>
            <button onClick={() => setExpanded(!expanded)} className="p-1 rounded hover:bg-white/10 transition-colors" aria-label={__tv(expanded ? 'Collapse panel' : 'Expand panel')}>
              {__tv(expanded ? <ChevronUp className="w-3.5 h-3.5 text-[var(--text-muted)]"/> : <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]"/>)}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-1.5 text-[9px] font-mono tracking-wider text-[#A9A59B]">
          {__tv(sources.length > 0 ? (<span title={__t("Source checks are independent of the number of reports.")} className="flex items-center gap-1 cursor-help" style={{ color: liveSources === sources.length ? '#00E676' : '#FF9500' }}>
              <span className="h-1.5 w-1.5 rounded-full animate-osiris-pulse" style={{ background: 'currentColor' }}/>
              {__tv(liveSources)}/{__tv(sources.length)}{__t(" SOURCES CHECKED")}</span>) : (<span>{__t("SOURCE STATUS UNKNOWN")}</span>))}
          {__tv(fetchedAt && <span title={__t("Feed fetched {0}", new Date(fetchedAt).toISOString())}>{__t(" · SNAPSHOT ")}{__tv(timeAgo(fetchedAt, now))}</span>)}
          {__tv(breakingCount > 0 && <span className="text-[#FF6B6B]">· {__tv(breakingCount)}{__t(" BREAKING")}</span>)}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {__tv(expanded && (<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className={`flex flex-1 min-h-0 ${maximized ? 'flex-col md:flex-row bg-[#0a0a09]' : 'flex-col bg-transparent'}`}>
            {__tv(maximized ? (<>
                <aside className="w-full md:w-[380px] max-h-[45%] md:max-h-none flex-shrink-0 overflow-y-auto styled-scrollbar border-r border-[#2A2A28] bg-[#0e0e0d] p-4">
                  {__tv(controls)}
                </aside>
                <div ref={listRef} className="flex-1 min-w-0 overflow-y-auto styled-scrollbar px-6 pt-2 pb-6">{__tv(listBody)}</div>
              </>) : (<>
                <div className="flex-shrink-0 pb-2 border-b border-[rgba(255,255,255,0.05)]">{__tv(controls)}</div>
                <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto styled-scrollbar px-3 pb-3">{__tv(listBody)}</div>
              </>))}
          </motion.div>))}
      </AnimatePresence>
    </motion.div>);
    // Maximising takes a click, so this branch never runs during server render.
    if (maximized && typeof document !== 'undefined') {
        return createPortal(content, document.body);
    }
    return content;
}
function EmptyState({ text, onClear, onRetry }: {
    text: string;
    onClear?: () => void;
    onRetry?: () => void;
}) {
    __useLocale();
    return (<div className="py-6 text-center">
      <div className="text-[11px] font-mono text-[var(--text-muted)]">{__tv(text)}</div>
      {__tv(onClear && <button onClick={onClear} className="mt-2 text-[10px] font-mono text-[var(--cyan-primary)] hover:underline">{__t("CLEAR FILTERS")}</button>)}
      {__tv(onRetry && <button onClick={onRetry} className="mt-2 text-[10px] font-mono text-[var(--cyan-primary)] hover:underline">{__t("TRY AGAIN")}</button>)}
    </div>);
}
