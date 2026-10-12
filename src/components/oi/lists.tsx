import { t as __t, translateValue as __tv, useLocale as __useLocale } from '@/i18n';
'use client';
/**
 * OSIRIS OI: the run as lists: the simulation as it happened, period by
 * period and world by world, the actors who play it, the world model and the
 * sources it read, and a way to question the actors afterwards.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, Loader2, Send, Trash2, Zap } from 'lucide-react';
import type { Engine, OiClient } from '@/lib/oi/client';
import { castOf, worldName, type RunState } from '@/lib/oi/state';
import { formatAmount, leader } from '@/lib/oi/forecast';
import { nodeName } from '@/lib/oi/research';
import type { Actor, ContextItem, Link, Move, Period, RoundStat, SimEvent } from '@/lib/oi/types';
import { ANCHOR, FIELD, LABEL, T, ago, gold, pct, toneColor } from './theme';
import { Avatar, Empty, Mentions, PointTag, STANCE, SectionTitle, Segmented, StanceTag, TypeIcon } from './atoms';
import { ReportBody } from './report';
import { PushTag, Quotes, SOURCE_KIND, SourceLink, sourceLabel } from './quotes';
import { PriceFan } from './fan';
import { priceText } from '@/lib/oi/quant';
export type Tab = 'report' | 'sim' | 'actors' | 'world' | 'ask';
export function RunTabs(p: {
    s: RunState;
    tab: Tab;
    setTab: (t: Tab) => void;
    oi: OiClient;
    engine: Engine;
    keyValue: string;
    ready: boolean;
    selected: string | null;
    onSelect: (k: string | null) => void;
    askTarget: string;
    setAskTarget: (t: string) => void;
    theater: boolean;
}) {
    __useLocale();
    const { s, tab, setTab } = p;
    const tabs: {
        id: Tab;
        label: string;
        count?: number;
    }[] = [
        ...(!p.theater && s.report ? [{ id: 'report' as Tab, label: 'Prediction' }] : []),
        { id: 'sim', label: 'Simulation', count: s.events.length || undefined },
        { id: 'actors', label: 'Actors', count: castOf(s).length || undefined },
        // The world model and the sources behind it: "Research", so it is not mistaken for the simulated worlds.
        { id: 'world', label: 'Research' },
        { id: 'ask', label: 'Q&A' },
    ];
    const current = tabs.some(t => t.id === tab) ? tab : 'sim';
    return (<div className={`flex flex-col ${p.theater ? 'h-full min-h-0' : ''}`}>
      <div role="tablist" className="flex items-stretch gap-1 px-2 border-b border-[var(--border-secondary)] flex-shrink-0 overflow-x-auto [scrollbar-width:none]">
        {__tv(tabs.map(t => {
            const on = current === t.id;
            return (<button key={t.id} role="tab" aria-selected={on} onClick={() => setTab(t.id)} className={`relative px-2 h-11 text-[10px] font-mono tracking-[0.12em] uppercase whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-active)] ${on ? 'text-[var(--gold-light)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-heading)]'}`}>
              {__tv(t.label)}{__tv(t.count ? <span className={`ml-1.5 tabular-nums ${on ? 'text-[var(--gold-primary)]' : 'text-[var(--text-muted)]'}`}>{__tv(t.count)}</span> : null)}
              {__tv(on && <motion.span layoutId={p.theater ? 'oi-tab-theater' : 'oi-tab'} className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full" style={{ background: T.gold }} transition={{ type: 'spring', stiffness: 500, damping: 40 }}/>)}
            </button>);
        }))}
      </div>
      <div className={`px-4 py-4 ${p.theater ? 'flex-1 min-h-0 overflow-y-auto styled-scrollbar' : ''}`}>
        {__tv(current === 'report' && s.report && <ReportBody s={s} runId={p.oi.runId} selected={p.selected} onSelect={p.onSelect}/>)}
        {__tv(current === 'sim' && <SimFeed s={s} selected={p.selected} onSelect={p.onSelect}/>)}
        {__tv(current === 'actors' && <ActorsList s={s} selected={p.selected} onSelect={p.onSelect}/>)}
        {__tv(current === 'world' && <WorldList s={s} selected={p.selected} onSelect={p.onSelect}/>)}
        {__tv(current === 'ask' && <AskBox s={s} oi={p.oi} engine={p.engine} keyValue={p.keyValue} ready={p.ready} target={p.askTarget} setTarget={p.setAskTarget} onSelect={p.onSelect}/>)}
      </div>
    </div>);
}
/** The latest period the simulation has reached: the highest anyone has moved, decided or stood in. */
export function periodReached(s: RunState): number {
    return Math.max(0, ...s.moves.map(m => m.period), ...s.events.map(e => e.period), ...s.points.map(p => p.period), ...Object.values(s.thinking));
}
/** The pooled figure after a period, as the period's header says it. */
export function pooledLabel(s: RunState, stat: RoundStat): string {
    if (s.frame?.kind === 'number' && stat.value)
        return `median ${formatAmount(stat.value.median)}`;
    if (s.frame?.kind === 'choice' && stat.shares)
        return `${s.frame.outcomes[leader(stat.shares)]} ${pct(Math.max(...stat.shares))}`;
    // Every world has settled it: how they settled, not a probability.
    const pts = s.points.filter(p => p.period === stat.round);
    if (s.frame?.kind === 'binary' && pts.length && pts.every(p => p.resolved))
        return `${pts.filter(p => p.resolved === 'yes').length} of ${pts.length} worlds YES`;
    return pct(stat.consensus);
}
/**
 * The simulation as it happened: newest period first, and within it each
 * world's events (what happened), where the question stood after them, and
 * the moves the actors made. Earlier periods fold their moves away.
 */
export function SimFeed({ s, selected, onSelect }: {
    s: RunState;
    selected: string | null;
    onSelect: (k: string | null) => void;
}) {
    __useLocale();
    const [world, setWorld] = useState('all');
    const [open, setOpen] = useState<Set<string>>(new Set());
    const cast = castOf(s);
    if (!cast.length) {
        return <Empty>{__tv(s.status === 'running' ? 'The actors who decide this are being cast. On the globe, the world model is drawing in.' : 'No simulation in this run.')}</Empty>;
    }
    const reached = periodReached(s);
    if (!reached)
        return <Empty>{__t("The actors are cast. The first period of simulated time is about to start.")}</Empty>;
    const worlds = world !== 'all' && s.worlds.includes(world) ? [world] : s.worlds;
    const periods = s.periods.filter(p => p.index <= reached).reverse();
    const toggle = (k: string) => setOpen(o => { const n = new Set(o); if (n.has(k))
        n.delete(k);
    else
        n.add(k); return n; });
    return (<div className="flex flex-col gap-5">
      {__tv(s.quant?.fan?.length ? (<div className="rounded-lg border border-[var(--border-secondary)] bg-white/[0.015] px-3 pt-2.5 pb-2">
          <SectionTitle>{__t("The price, world by world")}</SectionTitle>
          <PriceFan s={s}/>
        </div>) : null)}
      {__tv(s.worlds.length > 1 && (<div className="flex items-center gap-2.5">
          <span className={LABEL} style={{ color: T.label }}>{__t("World")}</span>
          <div className="flex-1"><Segmented id="sim-world" size="sm" value={worlds.length === 1 ? worlds[0] : 'all'} onChange={setWorld} options={[{ value: 'all', label: 'All' }, ...s.worlds.map(w => ({ value: w, label: w, title: worldName(w) }))]}/></div>
        </div>))}
      {__tv(periods.map(p => {
            const stat = s.rounds.find(r => r.round === p.index);
            const injects = s.injects.filter(x => x.round === p.index);
            return (<section key={p.index} className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <span className="text-[10px] font-mono tracking-[0.1em] uppercase whitespace-nowrap text-[var(--text-secondary)]">{__tv(p.label)}</span>
              <span className="flex-1 h-px bg-[var(--border-secondary)]"/>
              {__tv(stat && <span className="text-[10px] font-mono tabular-nums whitespace-nowrap text-[var(--gold-light)]" title={__t("The worlds pooled after this period")}>{__tv(pooledLabel(s, stat))}</span>)}
            </div>
            {__tv(injects.map((inj, i) => (<div key={i} className="rounded-md pl-3 pr-2.5 py-2 flex items-start gap-2 border-l-2" style={{ background: gold(0.05), borderColor: T.gold }}>
                <Zap className="w-3.5 h-3.5 mt-px flex-shrink-0 text-[var(--gold-primary)]"/>
                <p className="text-[11.5px] leading-snug text-[var(--text-primary)]"><span className="text-[var(--text-muted)]">{__t("Injected into every world \u00B7 ")}</span>{__tv(inj.text)}</p>
              </div>)))}
            {__tv(worlds.map(w => {
                    const k = `${w}:${p.index}`;
                    // The newest period, or a single world, shows its moves; older periods across every world fold them away.
                    const showMoves = p.index === reached || worlds.length === 1 || open.has(k);
                    return <WorldPeriod key={w} s={s} world={w} period={p} cast={cast} showMoves={showMoves} onToggle={p.index === reached || worlds.length === 1 ? undefined : () => toggle(k)} selected={selected} onSelect={onSelect}/>;
                }))}
          </section>);
        }))}
    </div>);
}
/** One world in one period: what happened, where it left the question, and what each actor did. */
function WorldPeriod({ s, world, period, cast, showMoves, onToggle, selected, onSelect }: {
    s: RunState;
    world: string;
    period: Period;
    cast: Actor[];
    showMoves: boolean;
    onToggle?: () => void;
    selected: string | null;
    onSelect: (k: string | null) => void;
}) {
    __useLocale();
    const point = s.points.find(x => x.world === world && x.period === period.index);
    const resolvedBefore = s.points.find(x => x.world === world && x.period < period.index && x.resolved);
    const events = s.events.filter(e => e.world === world && e.period === period.index && e.kind !== 'injected');
    const moves = cast.map(a => s.moves.find(m => m.world === world && m.period === period.index && m.actor === a.id)).filter((m): m is Move => !!m);
    const deciding = cast.filter(a => s.thinking[`${world}:${a.id}`] === period.index);
    const key = `w:${world}`;
    const pick = (k: string) => onSelect(selected === k ? null : k);
    if (resolvedBefore) {
        return (<div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
        <WorldChip world={world} on={selected === key} onClick={() => pick(key)}/>{__t("Settled in period ")}{__tv(resolvedBefore.period)}: <span className="text-[var(--text-secondary)]">{__tv(resolvedBefore.resolved)}</span>
      </div>);
    }
    return (<div className="rounded-lg border border-[var(--border-secondary)] bg-white/[0.015] px-3 py-3 flex flex-col gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <WorldChip world={world} on={selected === key} onClick={() => pick(key)}/>
        {__tv(point ? <span className="ml-auto"><PointTag point={point} frame={s.frame}/></span>
            : deciding.length ? <span className="ml-auto inline-flex items-center gap-1.5 text-[10.5px] text-[var(--oi-alt)]"><Loader2 className="w-3 h-3 animate-spin"/>{__tv(deciding.length)}{__t(" deciding")}</span> : null)}
      </div>
      {__tv(point?.price && s.quant && <WorldPrice close={point.price.close} high={point.price.high} low={point.price.low} open={s.points.find(x => x.world === world && x.period === period.index - 1)?.price?.close ?? s.quant.price} symbol={s.quant.symbol} currency={s.quant.currency} level={s.frame?.measure?.threshold}/>)}
      {__tv(point?.note && <p className="text-[11.5px] leading-relaxed text-[var(--text-secondary)]"><Mentions text={__tv(point.note)} s={s} onSelect={onSelect}/></p>)}
      {__tv(events.length > 0 && (<div className="flex flex-col gap-1.5">
          {__tv(events.map(e => <EventRow key={e.id} s={s} event={e} on={selected === `e:${e.id}`} onSelect={onSelect}/>))}
        </div>))}
      {__tv(moves.length > 0 && (showMoves ? (<div className="flex flex-col gap-3 pt-3 border-t border-[var(--border-secondary)]">
          {__tv(onToggle && <button onClick={onToggle} className={`self-start ${LABEL} text-[var(--text-muted)] hover:text-[var(--text-heading)]`}>{__t("Hide the moves")}</button>)}
          {__tv(moves.map(m => <MoveRow key={m.id} s={s} move={m} on={selected === `a:${m.actor}`} onSelect={onSelect}/>))}
        </div>) : (<button onClick={onToggle} className={`self-start inline-flex items-center gap-1 ${LABEL} text-[var(--text-secondary)] hover:text-[var(--text-heading)]`}>
          <ChevronDown className="w-3 h-3"/>{__tv(moves.length)}{__t(" move")}{__tv(moves.length === 1 ? '' : 's')}
        </button>)))}
      {__tv(showMoves && deciding.length > 0 && (<p className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
          <Loader2 className="w-3 h-3 animate-spin text-[var(--oi-alt)]"/>{__t("Deciding: ")}{__tv(deciding.map(a => a.name).join(', '))}
        </p>))}
    </div>);
}
/** Where a world's price ended a period, how far it moved, its range in the period, and the level the question is about. */
export function WorldPrice({ close, high, low, open, symbol, currency, level }: {
    close: number;
    high: number;
    low: number;
    open: number;
    symbol: string;
    currency: string;
    level?: number;
}) {
    __useLocale();
    const change = open > 0 ? close / open - 1 : 0;
    const up = change >= 0;
    return (<p className="flex items-center gap-2 flex-wrap text-[10px] font-mono tabular-nums text-[var(--text-muted)]">
      <span className="text-[var(--text-secondary)]">{__tv(symbol)}</span>
      <span className="text-[11px] text-[var(--text-heading)]">{__tv(priceText(close, currency))}</span>
      <span style={{ color: up ? T.gold : T.text }}>{__tv(up ? '▲' : '▼')} {__tv(Math.abs(Math.round(change * 1000) / 10))}%</span>
      <span>{__t("range ")}{__tv(priceText(low, currency))}–{__tv(priceText(high, currency))}</span>
      {__tv(level !== undefined && <span style={{ color: (level >= open ? high >= level : low <= level) ? T.goldLight : undefined }}>{__t("level ")}{__tv(priceText(level, currency))}</span>)}
    </p>);
}
function WorldChip({ world, on, onClick }: {
    world: string;
    on: boolean;
    onClick: () => void;
}) {
    __useLocale();
    return (<button onClick={onClick} title={__t("Open {0}", worldName(world))} className={`inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md border ${LABEL} transition-colors hover:text-[var(--gold-light)]`} style={{ color: on ? T.goldLight : T.heading, borderColor: on ? T.gold : 'var(--border-primary)', background: on ? gold(0.1) : 'rgba(255,255,255,0.02)' }}>
      <TypeIcon k={`w:${world}`} className="w-3 h-3" style={{ color: T.gold }}/>{__tv(worldName(world))}
    </button>);
}
/** Something that happened in a world, dated, with which way it pushed the question. */
export function EventRow({ s, event, on, onSelect }: {
    s: RunState;
    event: SimEvent;
    on: boolean;
    onSelect: (k: string | null) => void;
}) {
    __useLocale();
    const key = `e:${event.id}`;
    const surprise = event.kind === 'shock';
    return (<button onClick={() => onSelect(on ? null : key)} className={`flex items-start gap-2.5 -mx-1.5 px-1.5 py-1.5 rounded-md text-left transition-colors hover:bg-[var(--hover-accent)] ${on ? 'bg-[var(--hover-accent)]' : ''}`}>
      <TypeIcon k={key} subtype={event.kind} className="w-3.5 h-3.5 mt-[2px] flex-shrink-0" style={{ color: surprise ? T.goldLight : T.alt }}/>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[10px] font-mono tracking-[0.04em] text-[var(--text-muted)]">
          <span className="truncate">{__tv(event.date)}{__tv(event.place && ` · ${event.place}`)}</span>
          {__tv(surprise && <span className="flex-shrink-0 text-[var(--gold-light)]">{__t("\u00B7 Surprise")}</span>)}
          <span className="ml-auto flex-shrink-0"><PushTag c={event} frame={s.frame}/></span>
        </span>
        {/* Plain text: the row is itself a button, so the names in it open from the event's own view. */}
        <span className="block mt-0.5 text-[12px] font-medium leading-snug text-[var(--text-heading)]">{__tv(event.title)}</span>
        {__tv(event.detail && <span className="block mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">{__tv(event.detail)}</span>)}
      </span>
    </button>);
}
/** What an actor did in a period: the act, what it said, who it was aimed at, and what it quoted. */
export function MoveRow({ s, move, on, onSelect, showWorld = false }: {
    s: RunState;
    move: Move;
    on: boolean;
    onSelect: (k: string | null) => void;
    showWorld?: boolean;
}) {
    __useLocale();
    const actor = s.actors.find(a => a.id === move.actor);
    const key = `a:${move.actor}`;
    const pick = () => onSelect(on ? null : key);
    const targets = move.targets.map(t => s.actors.find(a => a.id === t)).filter((a): a is Actor => !!a);
    return (<motion.article initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className={`flex gap-2.5 rounded-md -mx-1.5 px-1.5 py-1 transition-colors ${on ? 'bg-[var(--hover-accent)]' : ''}`}>
      <button onClick={pick} aria-label={__t("Open {0}", actor?.name ?? move.actor)} className="self-start"><Avatar name={actor?.name ?? '?'} size={26} ring={on ? 'selected' : undefined}/></button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={pick} className="min-w-0 text-[12px] font-semibold truncate text-[var(--text-heading)] hover:text-[var(--gold-light)]">{__tv(actor?.name ?? move.actor)}</button>
          <StanceTag stance={move.stance}/>
          {__tv(showWorld && <span className={`ml-auto flex-shrink-0 ${LABEL} text-[var(--text-muted)]`}>{__tv(worldName(move.world))}{__t(" \u00B7 P")}{__tv(move.period)}</span>)}
        </div>
        {__tv(targets.length > 0 && <p className="mt-0.5 text-[10.5px] truncate text-[var(--text-muted)]">→ {__tv(targets.map(t => t.name).join(', '))}</p>)}
        <p className="mt-1 text-[12px] leading-[1.55] text-[var(--text-primary)]"><Mentions text={__tv(move.action)} s={s} onSelect={onSelect}/></p>
        {__tv(move.statement && <p className="mt-1 text-[11.5px] leading-relaxed italic text-[var(--text-secondary)]">“{__tv(move.statement)}”</p>)}
        <Quotes s={s} cites={move.cites} onSelect={onSelect}/>
      </div>
    </motion.article>);
}
/** The actors who play the simulation, each with what it wants and how it stands in every world. */
export function ActorsList({ s, selected, onSelect }: {
    s: RunState;
    selected: string | null;
    onSelect: (k: string | null) => void;
}) {
    __useLocale();
    const cast = castOf(s);
    const refs = useRef(new Map<string, HTMLButtonElement>());
    useEffect(() => {
        if (selected?.startsWith('a:'))
            refs.current.get(selected.slice(2))?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [selected]);
    if (!cast.length)
        return <Empty>{__tv(s.status === 'running' ? 'The actors who decide this are being cast.' : 'No actors were cast in this run.')}</Empty>;
    const thinking = new Set(Object.keys(s.thinking).map(k => k.slice(k.indexOf(':') + 1)));
    return (<div className="flex flex-col divide-y divide-[var(--border-secondary)]">
      {__tv(cast.map(a => {
            const key = `a:${a.id}`;
            const on = selected === key;
            const latest = s.worlds.map(w => ({ w, m: s.moves.filter(m => m.actor === a.id && m.world === w).pop() }));
            return (<button key={a.id} ref={el => { if (el)
                refs.current.set(a.id, el); }} onClick={() => onSelect(on ? null : key)} className={`flex items-center gap-3 -mx-2 px-2 py-2.5 text-left transition-colors hover:bg-[var(--hover-accent)] ${on ? 'bg-[var(--hover-accent)]' : ''}`}>
            <Avatar name={a.name} size={32} ring={on ? 'selected' : thinking.has(a.id) ? 'thinking' : undefined}/>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold truncate text-[var(--text-heading)]">{__tv(a.name)}</span>
              <span className="block mt-0.5 text-[11px] truncate text-[var(--text-muted)]">{__tv(a.persona?.goal || a.role)}</span>
            </span>
            {__tv(thinking.has(a.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0 text-[var(--oi-alt)]"/> : (<span className="flex items-center gap-1 flex-shrink-0" aria-label={__t("Its latest move in each world")}>
                {__tv(latest.map(({ w, m }) => (<span key={w} title={__tv(`${worldName(w)}: ${m ? `${STANCE[m.stance].word.toLowerCase()} · ${m.action}` : 'no move yet'}`)} className="w-2 h-2 rounded-full" style={{ background: m ? STANCE[m.stance].color : 'transparent', boxShadow: m ? undefined : 'inset 0 0 0 1px var(--border-primary)' }}/>)))}
              </span>))}
          </button>);
        }))}
    </div>);
}
/** What the arcs (and the graph's edges) mean, in their own Style Studio colours. */
export function Legend({ floating = false, compact = false }: {
    floating?: boolean;
    compact?: boolean;
}) {
    __useLocale();
    const rows: {
        label: string;
        color: string;
        dash?: string;
        opacity?: number;
    }[] = [
        { label: compact ? 'Aligned' : 'Aligned · cooperates', color: T.support },
        { label: compact ? 'Opposed' : 'Opposed · presses', color: T.oppose },
        { label: compact ? 'Between' : 'Between · holds', color: T.neutral },
        { label: 'Evidence', color: T.neutral, opacity: 0.55 },
        // Quotes are threads in the graph only; the globe does not draw them.
        ...(floating ? [] : [{ label: 'Quote', color: T.body, dash: '0.5 3.5' }]),
    ];
    return (<div className={`flex flex-wrap ${floating ? 'glass-panel oi-glass !rounded-full justify-center gap-x-5 gap-y-1.5 px-5 py-2.5' : 'gap-x-4 gap-y-1.5'}`}>
      {__tv(rows.map(r => (<span key={r.label} className="inline-flex items-center gap-2 text-[9.5px] font-mono tracking-[0.1em] uppercase text-[var(--text-secondary)]">
          <svg width="20" height="6" aria-hidden><line x1="1" x2="19" y1="3" y2="3" strokeWidth="2" strokeDasharray={r.dash} strokeLinecap="round" style={{ stroke: r.color, opacity: r.opacity ?? 1 }}/></svg>
          {__tv(r.label)}
        </span>)))}
    </div>);
}
export function LineGlyph({ link }: {
    link: Link;
}) {
    __useLocale();
    return (<svg width="18" height="6" className="flex-shrink-0" aria-hidden>
      <line x1="1" x2="17" y1="3" y2="3" strokeWidth="2" strokeDasharray={link.kind === 'cite' ? '0.5 3.5' : undefined} strokeLinecap="round" style={{ stroke: link.kind === 'cite' ? T.body : toneColor(link.tone), opacity: link.kind === 'evidence' ? 0.55 : 1 }}/>
    </svg>);
}
export function Row({ on, onClick, children }: {
    on: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    __useLocale();
    return (<button onClick={onClick} className={`flex items-center gap-2.5 -mx-2 px-2 py-1.5 rounded text-left transition-colors hover:bg-[var(--hover-accent)] ${on ? 'bg-[var(--hover-accent)]' : ''}`} style={{ width: 'calc(100% + 16px)' }}>
      {__tv(children)}
    </button>);
}
export function WorldList({ s, selected, onSelect }: {
    s: RunState;
    selected: string | null;
    onSelect: (k: string | null) => void;
}) {
    __useLocale();
    const relations = s.links.filter(l => l.kind === 'relation');
    if (!s.actors.length)
        return <Empty>{__t("The world model is being mapped.")}</Empty>;
    const pick = (key: string) => onSelect(selected === key ? null : key);
    return (<div className="flex flex-col gap-5">
      <Legend />
      <div>
        <SectionTitle count={s.actors.length}>{__t("Actors")}</SectionTitle>
        {__tv(s.actors.map(a => (<Row key={a.id} on={selected === `a:${a.id}`} onClick={() => pick(`a:${a.id}`)}>
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: a.persona ? gold(0.25) : 'transparent', boxShadow: `inset 0 0 0 1.5px ${a.persona ? T.gold : 'var(--border-active)'}` }}/>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold truncate text-[var(--text-heading)]">{__tv(a.name)}</span>
              <span className="block text-[11px] truncate text-[var(--text-muted)]">{__tv(a.role)}</span>
            </span>
            {__tv(a.persona && <span className={`${LABEL} text-[var(--gold-primary)]`} title={__t("Plays in the simulation")}>{__t("Plays")}</span>)}
            <span className={`${LABEL} text-[var(--text-muted)]`}>{__tv(a.kind)}</span>
          </Row>)))}
      </div>
      {__tv(relations.length > 0 && (<div>
          <SectionTitle count={relations.length}>{__t("Relations")}</SectionTitle>
          {__tv(relations.map(l => (<Row key={l.id} on={selected === `link:${l.id}`} onClick={() => pick(`link:${l.id}`)}>
              <LineGlyph link={l}/>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] truncate text-[var(--text-primary)]">{__tv(nodeName(s, l.from))} <span className="text-[var(--text-muted)]">⇄</span> {__tv(nodeName(s, l.to))}</span>
                <span className="block text-[11px] truncate text-[var(--text-muted)]">{__tv(l.label)}</span>
              </span>
            </Row>)))}
        </div>))}
      <ContextList s={s} selected={selected} onSelect={onSelect}/>
    </div>);
}
export function ContextList({ s, selected, onSelect }: {
    s: RunState;
    selected: string | null;
    onSelect: (k: string | null) => void;
}) {
    __useLocale();
    if (!s.context.length)
        return s.status === 'running' && !s.actors.length ? <Empty>{__t("Reading the live feeds.")}</Empty> : null;
    const cited = new Set(s.links.filter(l => l.kind === 'evidence').map(l => l.from.slice(2)));
    // How often the actors and the report quoted each source: the most quoted first, the unquoted after.
    const quoted = new Map<string, number>();
    for (const l of s.links)
        if (l.kind === 'cite')
            quoted.set(l.to.slice(2), (quoted.get(l.to.slice(2)) ?? 0) + 1);
    const order = s.context.map((c, i) => ({ c, i })).sort((a, b) => (quoted.get(b.c.id) ?? 0) - (quoted.get(a.c.id) ?? 0) || a.i - b.i).map(x => x.c);
    return (<div>
      <SectionTitle count={s.context.length}>{__t("Sources")}</SectionTitle>
      {__tv(order.map((c: ContextItem) => {
            const key = `c:${c.id}`;
            const n = quoted.get(c.id) ?? 0;
            const used = n > 0 || cited.has(c.id);
            return (<div key={c.id} className="flex items-start gap-1">
            <Row on={selected === key} onClick={() => onSelect(selected === key ? null : key)}>
              <span className="self-start mt-[6px] w-1.5 h-1.5 rounded-full flex-shrink-0" style={used ? { background: T.gold, boxShadow: `0 0 6px ${gold(0.7)}` } : { boxShadow: 'inset 0 0 0 1px var(--text-muted)' }}/>
              <span className="min-w-0 flex-1">
                <span className="block text-[11.5px] leading-snug text-[var(--text-primary)]">{__tv(c.kind === 'data' && c.id !== 'data' ? `“${c.title}”` : c.title)}</span>
                <span className="block mt-0.5 text-[10px] font-mono tracking-[0.04em] truncate text-[var(--text-muted)]">{__tv([`[${c.id}]`, SOURCE_KIND[c.kind], sourceLabel(c, c.id), ago(c.published)].filter(Boolean).join(' · '))}</span>
              </span>
              {__tv(c.kind === 'odds' && c.odds && <span className="self-start mt-px text-[10.5px] font-mono tabular-nums whitespace-nowrap" style={{ color: ANCHOR.market }} title={__t("{0} prices YES at {1}", c.odds.platform, pct(c.odds.probability))}>{__tv(pct(c.odds.probability))}</span>)}
              {__tv(c.kind === 'social' && <span className={`self-start mt-px ${LABEL} text-[var(--text-secondary)]`} title={__t("A post on a social network: an unverified claim, not reporting")}>{__t("Unverified")}</span>)}
              {__tv(n > 0 && <span className="self-start mt-px text-[10px] font-mono tabular-nums whitespace-nowrap text-[var(--gold-primary)]" title={__t("Quoted {0} time{1}", n, n === 1 ? '' : 's')}>{__tv(n)}×</span>)}
            </Row>
            <SourceLink url={c.url} className="mt-2 ml-1 flex-shrink-0"/>
          </div>);
        }))}
    </div>);
}
export function AskBox({ s, oi, engine, keyValue, ready, target, setTarget, onSelect }: {
    s: RunState;
    oi: OiClient;
    engine: Engine;
    keyValue: string;
    ready: boolean;
    target: string;
    setTarget: (t: string) => void;
    onSelect: (k: string | null) => void;
}) {
    __useLocale();
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [log, setLog] = useState<{
        who: string;
        text: string;
        you: boolean;
    }[]>([]);
    const cast = castOf(s);
    const targetName = target === 'report' ? 'The report agent' : cast.find(a => a.id === target)?.name ?? target;
    const send = async () => {
        const m = message.trim();
        if (!m || busy)
            return;
        setBusy(true);
        setLog(l => [...l, { who: 'You', text: m, you: true }]);
        setMessage('');
        const out = await oi.ask(target, m, engine, keyValue);
        setLog(l => [...l, { who: targetName, text: out.reply ?? out.error ?? '…', you: false }]);
        setBusy(false);
    };
    if (!cast.length)
        return <Empty>{__t("The actors can be questioned once they have been cast.")}</Empty>;
    return (<div className="flex flex-col gap-3">
      <select value={target} onChange={e => setTarget(e.target.value)} aria-label={__t("Who to ask")} className={`oi-select ${FIELD} h-9 px-2.5 text-[11.5px]`}>
        <option value="report" disabled={!s.report}>{__t("The report agent")}{__tv(!s.report ? ' (once the prediction is written)' : '')}</option>
        {__tv(cast.map(a => <option key={a.id} value={a.id}>{__tv(a.name)} · {__tv(a.role)}</option>))}
      </select>
      {__tv(log.length === 0 && <Empty>{__t("Ask the report agent why the prediction landed where it did, or ask an actor what it would do if things changed. Questions run on your key.")}</Empty>)}
      <div aria-live="polite" className="flex flex-col gap-3">
        {__tv(log.map((m, i) => (<motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`max-w-[88%] rounded-lg px-3 py-2 text-[12px] leading-relaxed border ${m.you ? 'self-end rounded-br-sm' : 'self-start rounded-bl-sm'}`} style={m.you ? { color: T.text, background: gold(0.1), borderColor: gold(0.3) } : { color: T.text, background: 'rgba(255,255,255,0.025)', borderColor: 'var(--border-secondary)' }}>
            {__tv(!m.you && <span className={`block mb-1 ${LABEL} text-[var(--gold-primary)]`}>{__tv(m.who)}</span>)}
            <span className="whitespace-pre-wrap">{__tv(m.you ? m.text : <Mentions text={__tv(m.text)} s={s} onSelect={onSelect}/>)}</span>
          </motion.div>)))}
      </div>
      <div className="flex items-center gap-2 h-9 pl-3 pr-1 rounded-md border border-[var(--border-primary)] bg-black/40 focus-within:border-[var(--border-active)] transition-colors">
        <input value={message} onChange={e => setMessage(e.target.value.slice(0, 1000))} onKeyDown={e => e.key === 'Enter' && send()} disabled={!ready || (target === 'report' && !s.report)} placeholder={__tv(!ready ? 'Add your key to ask' : `Ask ${targetName.replace(/^The /, 'the ')}`)} aria-label={__t("Your question")} className="flex-1 bg-transparent outline-none text-[11.5px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] disabled:opacity-50"/>
        <button onClick={send} disabled={!ready || busy || !message.trim()} aria-label={__t("Send")} className="w-7 h-7 rounded flex items-center justify-center text-[var(--gold-light)] hover:bg-[var(--hover-accent)] disabled:opacity-30 transition-colors">
          {__tv(busy ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Send className="w-3.5 h-3.5"/>)}
        </button>
      </div>
    </div>);
}
export function HistoryList({ oi, onPick }: {
    oi: OiClient;
    onPick: (id: string) => void;
}) {
    __useLocale();
    return (<section className="px-4 py-4">
      <SectionTitle count={oi.history.length || undefined}>{__t("Your predictions")}</SectionTitle>
      {__tv(!oi.history.length && <Empty>{__t("Nothing yet. Predictions you run are listed here, in this browser only. The server keeps a run for a few hours.")}</Empty>)}
      <div className="flex flex-col divide-y divide-[var(--border-secondary)]">
        {__tv(oi.history.map(h => (<div key={h.id} className="group flex items-center gap-3 py-2">
            <button onClick={() => onPick(h.id)} className="flex-1 min-w-0 text-left">
              <span className="block text-[11.5px] truncate text-[var(--text-primary)] transition-colors group-hover:text-[var(--gold-light)]">{__tv(h.question)}</span>
              <span className="block mt-0.5 text-[9px] font-mono tracking-[0.08em] uppercase text-[var(--text-muted)]">{__tv(new Date(h.at).toLocaleString())} · {__tv(h.status)}</span>
            </button>
            <span className="text-[10.5px] font-mono tabular-nums max-w-[130px] truncate text-[var(--gold-primary)]">{__tv(h.answer ?? pct(h.probability))}</span>
            <button onClick={() => oi.forget(h.id)} className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-[var(--text-muted)] hover:text-[var(--alert-red)]" aria-label={__t("Remove from history")}><Trash2 className="w-3.5 h-3.5"/></button>
          </div>)))}
      </div>
    </section>);
}
