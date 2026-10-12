import { apiUrl } from '@/lib/api-url';
import { t as __t, translateValue as __tv, useLocale as __useLocale } from '@/i18n';
'use client';
/**
 * OSIRIS OI: choosing an engine (provider, key, model) and asking a question.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, ChevronDown, Database, Eye, EyeOff, FileText, KeyRound, Loader2, Upload, X } from 'lucide-react';
import { PROVIDERS, providerInfo, type ProviderId } from '@/lib/oi/providers';
import { DEPTHS, PANEL_SEED_MAX, SEED_MAX, estimateCalls, seedCost, type SeedScope } from '@/lib/oi/depths';
import { checkKey, forgetKey, loadKey, saveEngine, saveKey, type Engine } from '@/lib/oi/client';
import type { Depth, Frame } from '@/lib/oi/types';
import { FIELD, KIND_SHORT, LABEL, T, blue, gold, shortName } from './theme';
import { Kbd, Overline, SectionTitle, Segmented, Switch, TextButton } from './atoms';
import { ModelPicker } from './ModelPicker';
export function EnginePill({ engine, ready, open, onClick, assist = false }: {
    engine: Engine;
    ready: boolean;
    open: boolean;
    onClick: () => void; /** In Assist the pill wears Assist's blue. */
    assist?: boolean;
}) {
    __useLocale();
    const info = providerInfo(engine.provider);
    const color = assist ? T.blue : T.gold;
    const tint = assist ? blue : gold;
    const lit = open || !ready;
    return (<button onClick={onClick} title={__t("Model engine and key")} aria-expanded={open} className={`mr-1 inline-flex items-center gap-1.5 h-7 pl-2 pr-1.5 rounded-md border text-[9.5px] font-mono tracking-[0.12em] uppercase transition-colors max-w-[140px] hover:bg-[var(--hover-accent)] ${lit ? '' : 'border-[var(--border-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-heading)]'}`} style={lit ? { borderColor: tint(0.45), color: assist ? T.blue : T.goldLight } : undefined}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={ready ? { background: color, boxShadow: `0 0 6px ${tint(0.7)}` } : { boxShadow: `inset 0 0 0 1.5px ${color}` }}/>
      <span className="truncate">{__tv(ready ? shortName(info.name) : 'Add key')}</span>
      <ChevronDown className="w-3 h-3 flex-shrink-0 transition-transform" style={{ transform: open ? 'rotate(180deg)' : undefined }}/>
    </button>);
}
export function EngineSheet({ engine, setEngine, keyValue, setKey, onDone }: {
    engine: Engine;
    setEngine: (e: Engine) => void;
    keyValue: string;
    setKey: (k: string) => void;
    onDone: () => void;
}) {
    __useLocale();
    const info = providerInfo(engine.provider);
    const [reveal, setReveal] = useState(false);
    const [models, setModels] = useState<{
        id: string;
        name: string;
    }[] | null>(null);
    const [listed, setListed] = useState(false);
    const [status, setStatus] = useState<{
        kind: 'idle' | 'checking' | 'ok' | 'error';
        text: string;
    }>({ kind: 'idle', text: '' });
    const pickProvider = (id: ProviderId) => {
        const next = { ...engine, provider: id, model: providerInfo(id).defaultModel };
        setEngine(next);
        saveEngine(next);
        setKey(loadKey(id));
        setModels(null);
        setListed(false);
        setStatus({ kind: 'idle', text: '' });
    };
    const check = async () => {
        setStatus({ kind: 'checking', text: '' });
        saveKey(engine.provider, keyValue, engine.remember);
        const out = await checkKey(engine.provider, keyValue);
        if ('error' in out) {
            setStatus({ kind: 'error', text: out.error });
            return;
        }
        setModels(out.models);
        setListed(out.listed);
        const model = out.models.some(m => m.id === engine.model) ? engine.model : out.preferred || engine.model;
        const next = { ...engine, model };
        setEngine(next);
        saveEngine(next);
        setStatus({ kind: 'ok', text: `Key accepted · ${out.models.length} model${out.models.length === 1 ? '' : 's'} available` });
    };
    const setModel = (model: string) => {
        const next = { ...engine, model };
        setEngine(next);
        saveEngine(next);
    };
    const known = useMemo(() => info.suggested.map(id => ({ id, name: id })), [info.suggested]);
    const ready = !info.needsKey || keyValue.length > 0;
    return (<section className="px-4 py-4 border-b border-[var(--border-secondary)] flex flex-col gap-4" style={{ background: gold(0.025) }}>
      <div>
        <SectionTitle right={ready ? <TextButton onClick={onDone}>{__t("Done")}</TextButton> : undefined}>{__t("Engine \u00B7 your own key")}</SectionTitle>
        <div className="grid grid-cols-3 gap-1">
          {__tv(PROVIDERS.map(p => {
            const on = engine.provider === p.id;
            return (<button key={p.id} onClick={() => pickProvider(p.id)} title={__tv(p.name)} aria-pressed={on} className={`h-8 px-1.5 rounded-md border text-[9.5px] font-mono tracking-[0.08em] uppercase truncate transition-colors ${on ? 'border-[var(--border-active)] bg-[var(--gold-primary)]/10 text-[var(--gold-light)]' : 'border-[var(--border-secondary)] bg-white/[0.02] text-[var(--text-secondary)] hover:bg-[var(--hover-accent)] hover:text-[var(--text-heading)]'}`}>
                {__tv(shortName(p.name))}
              </button>);
        }))}
        </div>
      </div>

      {__tv(info.needsKey ? (<div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <KeyRound className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"/>
              <input type={reveal ? 'text' : 'password'} value={keyValue} onChange={e => { setKey(e.target.value.trim()); setStatus({ kind: 'idle', text: '' }); }} placeholder={__t("{0} key  {1}", info.name, info.keyHint)} autoComplete="off" spellCheck={false} data-1p-ignore data-lpignore="true" aria-label={__t("{0} API key", info.name)} className={`${FIELD} h-8 pl-7 pr-8 text-[11px] font-mono`}/>
              <button onClick={() => setReveal(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-heading)]" aria-label={__tv(reveal ? 'Hide key' : 'Show key')}>
                {__tv(reveal ? <EyeOff className="w-3 h-3"/> : <Eye className="w-3 h-3"/>)}
              </button>
            </div>
            <button onClick={check} disabled={!keyValue || status.kind === 'checking'} className="oi-btn !h-8">
              {__tv(status.kind === 'checking' ? <Loader2 className="w-3 h-3 animate-spin"/> : 'Check')}
            </button>
          </div>
          {__tv(status.text && (<p role="status" className="text-[11px] flex items-center gap-1.5" style={{ color: status.kind === 'error' ? T.red : T.goldLight }}>
              {__tv(status.kind === 'ok' && <Check className="w-3 h-3"/>)}{__tv(status.text)}
            </p>))}
          <div className="flex items-center gap-3 text-[11px]">
            <label className="flex items-center gap-2 cursor-pointer text-[var(--text-secondary)]">
              <Switch on={engine.remember} label={__t("Remember the key on this device")} onChange={on => {
                const next = { ...engine, remember: on };
                setEngine(next);
                saveEngine(next);
                saveKey(engine.provider, keyValue, on);
            }}/>{__t("Remember on this device")}</label>
            <a href={info.keyUrl} target="_blank" rel="noopener noreferrer" className="ml-auto text-[var(--text-secondary)] hover:text-[var(--gold-light)]">{__t("Get a key \u2197")}</a>
            {__tv(keyValue && <button onClick={() => { forgetKey(engine.provider); setKey(''); setModels(null); setListed(false); setStatus({ kind: 'idle', text: '' }); }} className="text-[var(--text-secondary)] hover:text-[var(--alert-red)]">{__t("Forget")}</button>)}
          </div>
        </div>) : (<p className="text-[11.5px] leading-relaxed text-[var(--text-secondary)]">{__t("Scripted answers for trying the pipeline on a development server. No key, no cost, no real analysis.")}</p>))}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Overline>{__t("Model")}</Overline>
          <span className="ml-auto text-[9.5px] font-mono tracking-[0.1em] uppercase text-[var(--text-muted)]">
            {__tv(models ? (listed ? `${models.length} on this key` : 'Known names') : info.needsKey ? 'Recommended' : '')}
          </span>
        </div>
        <ModelPicker provider={engine.provider} models={models ?? known} value={engine.model} onChange={setModel} suggested={info.suggested} defaultModel={info.defaultModel} listed={listed && !!models}/>
        {__tv(!models && info.needsKey && <p className="text-[10.5px] text-[var(--text-muted)]">{__t("Check the key to list every model it can use, grouped by family.")}</p>)}
      </div>

      {__tv(info.needsKey && (<p className="text-[10.5px] leading-relaxed text-[var(--text-muted)]">{__t("Your key stays in this browser")}{__tv(engine.remember ? '' : ' tab')}{__t(" and reaches OSIRIS only inside your requests, which pass it to ")}{__tv(info.name)}{__t(" for your run. It is never stored on the server or logged. A prediction makes about 30 to 130 model calls, by depth, billed to your ")}{__tv(info.name)}{__t(" account.")}</p>))}
    </section>);
}
const EXAMPLES: {
    kind: Frame['kind'];
    text: string;
}[] = [
    { kind: 'binary', text: 'Will Russia and Ukraine agree a ceasefire before 1 July 2027?' },
    { kind: 'choice', text: 'Which way will the US Federal Reserve move rates at its next meeting: cut, hold or hike?' },
    { kind: 'number', text: 'Where will Brent crude settle on 31 December 2026, in USD a barrel?' },
];
/* ───────────── Your data ───────────── */
interface DataFile {
    id: number;
    name: string;
    text: string;
}
/** Text a prediction can read. A PDF or Word file has to be saved as text first. */
const TEXT_TYPES = ['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'log', 'xml', 'html', 'htm', 'yaml', 'yml'];
const MAX_FILES = 8;
const MAX_FILE_BYTES = 2000000;
const fmtCount = (n: number) => (n < 1000 ? `${n}` : n < 1000000 ? `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k` : `${(n / 1000000).toFixed(1)}M`);
/** What a prediction reads: each file under its name, then anything pasted. */
function assemble(files: DataFile[], paste: string): string {
    const parts = files.map(f => `### ${f.name}\n${f.text}`);
    if (paste.trim())
        parts.push(files.length ? `### Notes\n${paste.trim()}` : paste.trim());
    return parts.join('\n\n');
}
/** A file's text, or why it cannot be read. A web page is read as its visible text, which costs far fewer tokens. */
async function readText(file: File): Promise<{
    text: string;
} | {
    error: string;
}> {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!TEXT_TYPES.includes(ext))
        return { error: `${file.name}: text files only (${TEXT_TYPES.slice(0, 7).join(', ')} …). Save a PDF or Word file as text first.` };
    if (file.size > MAX_FILE_BYTES)
        return { error: `${file.name} is over 2 MB.` };
    let text = await file.text().catch(() => '');
    if (text.includes(String.fromCharCode(0)))
        return { error: `${file.name} is not a text file.` };
    if (ext === 'html' || ext === 'htm') {
        // Parsed, never run: scripts and styles are dropped, the visible text kept.
        const doc = new DOMParser().parseFromString(text, 'text/html');
        doc.querySelectorAll('script, style, noscript, template').forEach(n => n.remove());
        text = doc.body?.textContent ?? '';
    }
    text = text.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return text ? { text } : { error: `${file.name} is empty.` };
}
function YourData({ files, setFiles, paste, setPaste, scope, setScope, depth, providerName }: {
    files: DataFile[];
    setFiles: (f: DataFile[]) => void;
    paste: string;
    setPaste: (v: string) => void;
    scope: SeedScope;
    setScope: (s: SeedScope) => void;
    depth: Depth;
    providerName: string;
}) {
    __useLocale();
    const input = useRef<HTMLInputElement>(null);
    const nextId = useRef(1);
    const [note, setNote] = useState('');
    const [over, setOver] = useState(false);
    const chars = assemble(files, paste).length;
    const cost = seedCost(chars, depth, scope);
    const add = async (list: FileList | null) => {
        if (!list?.length)
            return;
        const room = MAX_FILES - files.length;
        const picked = Array.from(list).slice(0, Math.max(0, room));
        const read = await Promise.all(picked.map(readText));
        const added: DataFile[] = [];
        const problems: string[] = list.length > room ? [`Up to ${MAX_FILES} files.`] : [];
        read.forEach((r, i) => {
            if ('error' in r)
                problems.push(r.error);
            else
                added.push({ id: nextId.current++, name: picked[i].name, text: r.text });
        });
        setFiles([...files, ...added]);
        setNote(problems.join(' '));
        if (input.current)
            input.current.value = '';
    };
    return (<div className="flex flex-col gap-3">
      <div onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); void add(e.dataTransfer.files); }} className="flex items-center gap-3 rounded-md border border-dashed px-3 py-2.5 transition-colors" style={{ borderColor: over ? T.gold : 'var(--border-primary)', background: over ? gold(0.08) : 'rgba(0,0,0,0.25)' }}>
        <Upload className="w-4 h-4 flex-shrink-0" style={{ color: over ? T.goldLight : T.label }}/>
        <span className="flex-1 min-w-0 text-[11.5px] leading-snug text-[var(--text-secondary)]">
          <button type="button" onClick={() => input.current?.click()} className="text-[var(--gold-light)] underline decoration-dotted underline-offset-2 hover:text-[var(--text-heading)]">{__t("Add files")}</button>
          {__t(" ")}{__t("or drop them here")}<span className="block text-[10.5px] text-[var(--text-muted)]">{__t("CSV, JSON, Markdown, text, logs, web pages")}</span>
        </span>
        <input ref={input} type="file" multiple hidden accept={TEXT_TYPES.map(t => `.${t}`).join(',')} onChange={e => void add(e.target.files)} aria-label={__t("Add data files")}/>
      </div>

      {__tv(files.length > 0 && (<ul className="flex flex-col gap-1">
          {__tv(files.map(f => (<li key={f.id} className="flex items-center gap-2 h-8 pl-2.5 pr-1 rounded-md border border-[var(--border-secondary)] bg-black/30">
              <FileText className="w-3.5 h-3.5 flex-shrink-0 text-[var(--text-secondary)]"/>
              <span className="flex-1 min-w-0 truncate text-[11.5px] text-[var(--text-primary)]" title={__tv(f.name)}>{__tv(f.name)}</span>
              <span className="text-[10px] font-mono tabular-nums text-[var(--text-muted)]">{__tv(fmtCount(f.text.length))}{__t(" chars")}</span>
              <button type="button" onClick={() => setFiles(files.filter(x => x.id !== f.id))} aria-label={__t("Remove {0}", f.name)} className="w-6 h-6 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--alert-red)] hover:bg-[var(--hover-accent)]">
                <X className="w-3 h-3"/>
              </button>
            </li>)))}
        </ul>))}

      <textarea value={paste} onChange={e => setPaste(e.target.value.slice(0, SEED_MAX))} rows={3} aria-label={__t("Paste your data")} placeholder={__tv(files.length ? 'Notes to go with the files (optional)' : 'Or paste a report, notes, a table…')} className={`${FIELD} rounded-md resize-y px-3 py-2 text-[11.5px] leading-relaxed`}/>

      {__tv(note && <p role="alert" className="text-[11px] leading-snug" style={{ color: T.red }}>{__tv(note)}</p>)}

      <div className="flex flex-col gap-1.5">
        <Overline>{__t("Who reads it")}</Overline>
        <Segmented id="seed-scope" size="sm" value={scope} onChange={setScope} options={[
            { value: 'brief', label: 'World model', title: 'Read once, built into the brief every actor plays from' },
            { value: 'panel', label: 'Every actor', title: 'Every actor’s move and the report read it directly too' },
        ]}/>
        <p className="text-[10.5px] leading-snug text-[var(--text-muted)]">
          {__tv(scope === 'brief'
            ? 'The world model reads all of it once and builds it into the brief every actor plays from.'
            : `As well, every actor in every period of every world, and the report agent, read the first ${PANEL_SEED_MAX.toLocaleString()} characters directly, and can quote it.`)}
        </p>
      </div>

      <p className="text-[11px] leading-snug" style={{ color: chars ? T.text : T.mute }}>
        {__tv(chars
            ? <>{__t("About ")}<span className="font-mono tabular-nums" style={{ color: T.goldLight }}>+{__tv(fmtCount(cost.tokens))}</span>{__t(" input tokens on your ")}{__tv(shortName(providerName))}{__t(" key, over ")}{__tv(cost.calls)}{__t(" call")}{__tv(cost.calls === 1 ? '' : 's')}.</>
            : 'Billed to your own key as input tokens: about one per four characters.')}
      </p>
      {__tv(chars > SEED_MAX && <p className="text-[11px] leading-snug" style={{ color: T.goldLight }}>{__t("That is ")}{__tv(fmtCount(chars))}{__t(" characters; a prediction reads the first ")}{__tv(SEED_MAX.toLocaleString())}.</p>)}
    </div>);
}
/** A list of questions to start from: a tag on the left (the market's price, or the kind of question), the question, an arrow on hover. */
function Suggestions({ title, items, onPick }: {
    title: string;
    items: {
        key: string;
        tag: ReactNode;
        text: string;
        hint?: string;
    }[];
    onPick: (text: string) => void;
}) {
    __useLocale();
    return (<div>
      <span className={`block mb-1 ${LABEL}`} style={{ color: T.label }}>{__tv(title)}</span>
      <div className="flex flex-col">
        {__tv(items.map(x => (<button key={x.key} onClick={() => onPick(x.text)} title={__tv(x.hint)} className="group flex items-center gap-3 h-8 -mx-2 px-2 rounded-md text-left transition-colors hover:bg-[var(--hover-accent)]">
            <span className="w-[64px] flex-shrink-0 whitespace-nowrap">{__tv(x.tag)}</span>
            <span className="flex-1 min-w-0 text-[12px] truncate text-[var(--text-secondary)] transition-colors group-hover:text-[var(--text-heading)]">{__tv(x.text)}</span>
            <ArrowRight className="w-3.5 h-3.5 flex-shrink-0 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-[var(--gold-primary)]"/>
          </button>)))}
      </div>
    </div>);
}
export function AskForm({ ready, providerName, onRun, onKey }: {
    ready: boolean;
    providerName: string;
    onKey: () => void;
    onRun: (input: {
        question: string;
        seed: string;
        seedScope: SeedScope;
        depth: Depth;
        useFeeds: boolean;
    }) => Promise<boolean>;
}) {
    __useLocale();
    const [question, setQuestion] = useState('');
    const [files, setFiles] = useState<DataFile[]>([]);
    const [paste, setPaste] = useState('');
    const [scope, setScope] = useState<SeedScope>('brief');
    const [showData, setShowData] = useState(false);
    const [depth, setDepth] = useState<Depth>('standard');
    const [useFeeds, setUseFeeds] = useState(true);
    const [starting, setStarting] = useState(false);
    // What the world is betting on: questions with the crowd's price on them, to run OI against.
    const [trending, setTrending] = useState<{
        question: string;
        probability: number;
        event: string;
        url: string;
    }[]>([]);
    useEffect(() => {
        const ctl = new AbortController();
        fetch(apiUrl('/api/oi/trending'), { signal: ctl.signal })
            .then(r => (r.ok ? r.json() : null))
            .then(j => { if (Array.isArray(j?.items))
            setTrending(j.items); })
            .catch(() => { });
        return () => ctl.abort();
    }, []);
    const valid = question.trim().length >= 8;
    const seed = assemble(files, paste);
    const dataCost = seedCost(seed.length, depth, scope);
    const run = async () => {
        if (!ready || !valid || starting)
            return;
        setStarting(true);
        const ok = await onRun({ question: question.trim(), seed: seed.slice(0, SEED_MAX), seedScope: scope, depth, useFeeds });
        setStarting(false);
        if (ok) {
            setQuestion('');
            setFiles([]);
            setPaste('');
        }
    };
    const d = DEPTHS[depth];
    return (<section className="px-4 pt-5 pb-4 flex flex-col gap-5">
      <div>
        <h3 className="text-[16px] font-semibold tracking-[0.01em] text-[var(--text-heading)]">{__t("Predict what happens")}</h3>
        <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">{__t("Ask a question. OI casts the actors who decide it and plays it out in parallel worlds, grounded in live research and any data you add. It draws on the globe as it runs.")}</p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="relative">
          <textarea value={question} onChange={e => setQuestion(e.target.value.slice(0, 500))} rows={3} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey))
        void run(); }} placeholder={__t("What do you want to know?")} aria-label={__t("Your question")} className={`${FIELD} !rounded-lg resize-none px-3.5 pt-3 pb-8 text-[13.5px] leading-relaxed`}/>
          <span className="absolute left-3.5 right-3 bottom-2.5 flex items-center justify-between pointer-events-none text-[10px] text-[var(--text-muted)]">
            <span>{__tv(question && !valid ? 'A little more detail' : '')}</span>
            {__tv(valid && ready && <span className="inline-flex items-center gap-1"><Kbd>{__t("Ctrl")}</Kbd><Kbd>↵</Kbd>{__t(" to run")}</span>)}
          </span>
        </div>
        {__tv(!question && trending.length > 0 && (<Suggestions title={__t("What the markets are betting on now")} onPick={setQuestion} items={trending.slice(0, 4).map(x => ({
                key: x.url + x.question, text: x.question, hint: `${x.event}: Polymarket prices YES at ${Math.round(x.probability * 1000) / 10}%`,
                tag: <span className="text-[11px] font-mono tabular-nums text-[var(--gold-primary)]">{__tv(Math.round(x.probability * 100))}%<span className="ml-1 text-[9.5px] text-[var(--text-muted)]">{__t("yes")}</span></span>,
            }))}/>))}
        {__tv(!question && (<Suggestions title={__tv(trending.length ? 'Or try' : 'Try')} onPick={setQuestion} items={EXAMPLES.map(x => ({
                key: x.text, text: x.text,
                tag: <span className="text-[9.5px] font-mono tracking-[0.08em] uppercase" style={{ color: T.label }}>{__tv(KIND_SHORT[x.kind])}</span>,
            }))}/>))}
      </div>

      {/* The settings, in one card: how deep, what it reads, and anything of your own. */}
      <div className="rounded-lg border border-[var(--border-secondary)] bg-white/[0.012] divide-y divide-[var(--border-secondary)]">
        <div className="px-3 pt-2.5 pb-3 flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <Overline>{__t("Depth")}</Overline>
            <span className="text-[10px] font-mono tabular-nums text-[var(--text-muted)] truncate" title={__t("{0} actors play {1} periods of simulated time in {2} parallel worlds", d.actors, d.periods, d.worlds)}>
              {__tv(d.actors)}{__t(" actors \u00B7 ")}{__tv(d.periods)}{__t(" periods \u00B7 ")}{__tv(d.worlds)}{__t(" worlds \u00B7 ~")}{__tv(estimateCalls(depth, useFeeds))}{__t(" calls")}</span>
          </div>
          <Segmented id="depth" value={depth} onChange={setDepth} options={(Object.keys(DEPTHS) as Depth[]).map(k => ({ value: k, label: DEPTHS[k].label }))}/>
        </div>

        <label className="px-3 py-2.5 flex items-center gap-3 cursor-pointer">
          <span className="flex-1 min-w-0">
            <span className="block text-[12px] text-[var(--text-heading)]">{__t("Live research")}</span>
            <span className="block mt-0.5 text-[10.5px] leading-snug text-[var(--text-muted)]">{__t("News with links, market prices, prediction markets and the OSIRIS feeds that bear on it")}</span>
          </span>
          <Switch on={useFeeds} onChange={setUseFeeds} label={__t("Research the question and read the live OSIRIS feeds")}/>
        </label>

        <div>
          <button onClick={() => setShowData(!showData)} aria-expanded={showData} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-[var(--hover-accent)]">
            <Database className="w-3.5 h-3.5 flex-shrink-0" style={{ color: seed ? T.goldLight : T.label }}/>
            <span className="text-[12px] text-[var(--text-heading)]">{__t("Your data")}</span>
            <span className="flex-1 min-w-0 text-right text-[10px] font-mono tabular-nums truncate" style={{ color: seed ? T.goldLight : T.mute }}>
              {__tv(seed
            ? `${files.length ? `${files.length} file${files.length === 1 ? '' : 's'} · ` : ''}${fmtCount(Math.min(seed.length, SEED_MAX))} chars · +${fmtCount(dataCost.tokens)} tokens`
            : 'Optional')}
            </span>
            <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-[var(--text-muted)] transition-transform" style={{ transform: showData ? 'rotate(180deg)' : undefined }}/>
          </button>
          <AnimatePresence initial={false}>
            {__tv(showData && (<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <div className="px-3 pb-3 pt-0.5">
                  <YourData files={files} setFiles={setFiles} paste={paste} setPaste={setPaste} scope={scope} setScope={setScope} depth={depth} providerName={providerName}/>
                </div>
              </motion.div>))}
          </AnimatePresence>
        </div>
      </div>

      {__tv(ready ? (<button onClick={run} disabled={!valid || starting} className="oi-btn-primary w-full">
          {__tv(starting ? <Loader2 className="w-4 h-4 animate-spin"/> : null)}
          {__tv(starting ? 'Starting' : 'Run prediction')}
          {__tv(!starting && <ArrowRight className="w-4 h-4"/>)}
        </button>) : (<div className="flex flex-col gap-2.5 rounded-lg border px-3.5 py-3" style={{ borderColor: gold(0.3), background: gold(0.04) }}>
          <p className="text-[11.5px] leading-snug text-[var(--text-secondary)]">{__t("OI runs on your own AI key. It stays in this browser, and a prediction is billed to your account: about ")}{__tv(estimateCalls(depth, useFeeds))}{__t(" model calls at this depth.")}</p>
          <button onClick={onKey} className="oi-btn-primary w-full"><KeyRound className="w-4 h-4"/>{__t(" Add your ")}{__tv(shortName(providerName))}{__t(" key")}</button>
        </div>))}

      <p className="text-[10.5px] leading-relaxed text-[var(--text-muted)]">{__t("The answer takes the shape of the question: a probability, a share for each outcome, or an estimate with a range, with the path, each actor&apos;s moves and how every world ended. A simulation, not a guarantee. Method after")}{__t(" ")}
        <a href="https://github.com/666ghj/MiroFish" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-[var(--gold-light)]">{__t("MiroFish")}</a>{__t("; also on the")}{__t(" ")}
        <a href="/docs#oi" className="underline decoration-dotted underline-offset-2 hover:text-[var(--gold-light)]">{__t("API and MCP")}</a>.
      </p>
    </section>);
}
