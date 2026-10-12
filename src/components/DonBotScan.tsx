import { t as __t, translateValue as __tv, useLocale as __useLocale } from '@/i18n';
'use client';
import { useEffect, useRef, useState } from 'react';
import { Search, ExternalLink, X, Loader2, ShieldCheck } from 'lucide-react';
import { DONBOT_ORIGIN, DONBOT_ANALYZER, DONBOT_CHAINS, DONBOT_SANDBOX, cleanQuery, donbotFrameUrl, parseDonbotMessage, type DonbotResult, } from '@/lib/donbot';
/**
 * DonBot, in Markets → Crypto and in RECON: DigitalDon's token analyzer,
 * embedded without its script. See lib/donbot for what crosses the boundary and why.
 */
const ACCENT = '#F7931A';
const INITIAL_HEIGHT = 420;
export default function DonBotScan({ initial = null, onScan }: {
    /** A scan to open on — how a host that remounts this keeps the token it was showing. */
    initial?: string | null;
    /** Told of every scan run and every close, so a host can hand it back as `initial`. */
    onScan?: (query: string | null) => void;
} = {}) {
    __useLocale();
    const [input, setInput] = useState(initial ?? '');
    /** What the frame is showing; null means no frame at all. */
    const [query, setQuery] = useState<string | null>(initial);
    const [height, setHeight] = useState(INITIAL_HEIGHT);
    const [loaded, setLoaded] = useState(false);
    const [result, setResult] = useState<DonbotResult | null>(null);
    const frame = useRef<HTMLIFrameElement>(null);
    useEffect(() => {
        if (!query)
            return;
        const onMessage = (event: MessageEvent) => {
            // Their origin, and our own frame — not some other page's.
            if (event.origin !== DONBOT_ORIGIN || event.source !== frame.current?.contentWindow)
                return;
            const message = parseDonbotMessage(event.data);
            if (!message)
                return;
            if (message.type === 'resize')
                setHeight(message.height);
            else
                setResult(message);
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [query]);
    const scan = () => {
        const q = cleanQuery(input);
        if (!q)
            return;
        setResult(null);
        setLoaded(false);
        setHeight(INITIAL_HEIGHT);
        setQuery(q);
        onScan?.(q);
    };
    const close = () => {
        setQuery(null);
        setResult(null);
        onScan?.(null);
    };
    return (<div className="space-y-2">
      <form onSubmit={e => { e.preventDefault(); scan(); }} className="flex gap-1.5">
        <div className="flex-1 relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--text-muted)]"/>
          <input value={input} onChange={e => setInput(e.target.value)} placeholder={__t("Ticker, name or contract address")} aria-label={__t("Token to analyse")} autoComplete="off" spellCheck={false} className="w-full bg-[var(--bg-primary)]/60 border border-[var(--border-primary)] rounded-lg pl-7 pr-2 py-2 text-[10px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/50 focus:outline-none" style={{ borderColor: input ? `${ACCENT}55` : undefined }}/>
        </div>
        <button type="submit" disabled={!cleanQuery(input)} className="px-3 rounded-lg text-[9px] font-mono font-bold tracking-wider disabled:opacity-30 transition-colors" style={{ background: `${ACCENT}22`, border: `1px solid ${ACCENT}55`, color: ACCENT }}>{__t("ANALYZE")}</button>
      </form>

      <div className="text-[9px] font-mono text-[var(--text-muted)] leading-relaxed">
        {__tv(DONBOT_CHAINS.join(' · '))}
      </div>

      {__tv(!query && (<div className="p-2.5 rounded-lg border border-[var(--border-primary)] bg-white/[0.02] space-y-1.5">
          <div className="text-[10px] font-mono text-[var(--text-secondary)] leading-relaxed">{__t("A signal score out of 100, entry and exit zones, and the holder cluster map for any token: top wallets, the ones linked by funding, and snipers, bundles and fresh wallets flagged.")}</div>
          <div className="flex items-start gap-1.5 text-[9px] font-mono text-[var(--text-muted)] leading-relaxed">
            <ShieldCheck className="w-3 h-3 mt-px shrink-0" style={{ color: ACCENT }}/>
            <span>{__t("Nothing loads until you analyse a token. DonBot then runs sealed in its own frame: none of its code runs on OSIRIS, and it isn&apos;t told which site you&apos;re on.")}</span>
          </div>
        </div>))}

      {__tv(query && (<div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 text-[10px] font-mono truncate">
              {__tv(result ? (<span title={__tv(result.thesis)}>
                  <span className="font-bold" style={{ color: ACCENT }}>${__tv(result.symbol)}</span>
                  <span className="text-[var(--text-muted)]">{__t(" \u00B7 SIGNAL ")}</span>
                  <span className="font-bold text-[var(--text-primary)]">{__tv(result.score)}/100</span>
                  {__tv(result.thesis && <span className="text-[var(--text-secondary)]"> · {__tv(result.thesis)}</span>)}
                </span>) : (<span className="text-[var(--text-muted)] flex items-center gap-1.5">
                  {__tv(!loaded && <Loader2 className="w-3 h-3 animate-spin"/>)}
                  {__tv(loaded ? `Analysing “${query}”…` : 'Loading DonBot…')}
                </span>))}
            </div>
            <button onClick={close} title={__t("Close DonBot")} aria-label={__t("Close DonBot")} className="p-1 rounded text-[var(--text-muted)] hover:text-white hover:bg-white/10 shrink-0">
              <X className="w-3 h-3"/>
            </button>
          </div>

          <iframe key={query} ref={frame} src={donbotFrameUrl(query)} title={__t("DonBot token analysis by DigitalDon")} sandbox={DONBOT_SANDBOX} referrerPolicy="no-referrer" allow="fullscreen" allowFullScreen onLoad={() => setLoaded(true)} className="block w-full border-0 rounded-lg bg-transparent" style={{ height }}/>

          <div className="flex items-center justify-between text-[9px] font-mono text-[var(--text-muted)]">
            <span>{__tv(result ? 'Not financial advice.' : ' ')}</span>
            <a href={DONBOT_ANALYZER} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-[var(--text-secondary)]">{__t("DonBot by DigitalDon ")}<ExternalLink className="w-2.5 h-2.5"/>
            </a>
          </div>
        </div>))}
    </div>);
}
