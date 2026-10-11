import { useEffect, useRef, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, ChevronUp, ExternalLink, X } from "lucide-react";
import type { GlobalMarketQuote, GlobalMarketsSnapshot } from "../../shared/types";
import { apiUrl } from "../lib/api";
import { formatFull } from "../lib/time";

const groups = { indices: "Global indices", commodities: "Energy & commodities", fx: "Currencies", crypto: "Digital assets" };
const priceFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const fxFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4, minimumFractionDigits: 4 });

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const points = values.map((value, index) => `${index / (values.length - 1) * 76},${23 - (value - min) / span * 21}`).join(" ");
  return <svg className="economic-sparkline" viewBox="0 0 76 26" aria-hidden="true"><polyline fill="none" stroke="currentColor" strokeWidth="1.3" points={points} /></svg>;
}

function Quote({ quote, failed }: { quote: GlobalMarketQuote; failed: boolean }) {
  const positive = (quote.changePercent || 0) >= 0;
  return <><div className="economic-quote-main"><span>{quote.name}</span><strong>{quote.price === null ? "—" : (quote.group === "fx" ? fxFormat : priceFormat).format(quote.price)}</strong></div><div className={`economic-quote-change ${quote.changePercent === null ? "" : positive ? "economic-up" : "economic-down"}`}><span>{quote.changePercent === null ? (quote.price === null ? "No quote" : "Change N/A") : <>{positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{positive ? "+" : ""}{quote.changePercent.toFixed(2)}%</>}</span><Sparkline values={quote.spark} /></div><small className="economic-quote-state">{failed || quote.state === "stale" ? "Delayed" : quote.state === "unavailable" ? "Unavailable" : quote.marketOpen ? "Public quote" : "Latest quote"}</small></>;
}

export function EconomicMarkets({ revision }: { revision: number }) {
  const [snapshot, setSnapshot] = useState<GlobalMarketsSnapshot | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;
    async function load() {
      if (cancelled || controller) return;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 15_000);
      try {
        const response = await fetch(apiUrl("/api/markets"), { signal: controller.signal, cache: "no-cache" });
        if (!response.ok) throw new Error("Market data is unavailable");
        const data = await response.json() as GlobalMarketsSnapshot;
        if (!Array.isArray(data.quotes)) throw new Error("Invalid market data format");
        if (!cancelled) { setSnapshot(data); setError(false); }
      } catch { if (!cancelled) setError(true); }
      finally { window.clearTimeout(timeout); controller = null; }
    }
    void load();
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60_000);
    return () => { cancelled = true; controller?.abort(); window.clearInterval(interval); };
  }, [revision]);
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus({ preventScroll: true });
    function onKey(event: KeyboardEvent) { if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return <><footer className="economic-market-strip" aria-label="Global market quotes"><button type="button" className="economic-strip-title" aria-label="Toggle global markets" aria-expanded={open} aria-controls="economic-market-panel" onClick={() => setOpen((value) => !value)} ref={triggerRef}><Activity size={16} /><span>Markets<small>MARKET PULSE</small></span><ChevronUp size={12} className={open ? "is-open" : ""} /></button><div className="economic-ticker-scroll">{snapshot?.quotes.length ? snapshot.quotes.map((quote) => <button type="button" className="economic-market-quote" key={quote.symbol} onClick={() => setOpen(true)} title={`${quote.name} · ${quote.observedAt ? formatFull(quote.observedAt) : "Quote time unavailable"} · ${quote.currency}`} aria-label={`${quote.name}, ${quote.price === null ? "Unavailable" : `${priceFormat.format(quote.price)} ${quote.currency}`}, View global market details`}><Quote quote={quote} failed={error} /></button>) : <span className="economic-market-empty">{error ? "Market data is unavailable. Retrying automatically." : "Loading global indices, energy and currencies…"}</span>}</div><button type="button" className="economic-all-markets" onClick={() => setOpen((value) => !value)} aria-label="View all global markets"><ChevronUp size={16} /></button></footer>
    {open ? <section id="economic-market-panel" className="economic-markets-panel economic-panel" tabIndex={-1} ref={panelRef} aria-labelledby="economic-markets-title"><div className="economic-panel-heading"><div><Activity size={15} /><h2 id="economic-markets-title">Global markets</h2></div><button type="button" className="economic-icon-button" aria-label="Close global markets" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}><X size={16} /></button></div><p className="economic-markets-description">{snapshot?.provider || "Public market data"} · Updated every 60s · quotes may be delayed · times UTC+8{error ? " · Update failed; showing last quotes" : ""}</p><div className="economic-markets-grid">{Object.entries(groups).map(([id, label]) => <section className="economic-market-group" key={id}><h3>{label}</h3>{snapshot?.quotes.filter((quote) => quote.group === id).map((quote) => <article key={quote.symbol}><div className="economic-expanded-quote"><Quote quote={quote} failed={error} /></div><div className="economic-quote-details"><span>{quote.provider || snapshot?.provider || "Public quote"} · {quote.currency || "—"} · {quote.observedAt ? formatFull(quote.observedAt) : "Quote time unavailable"}</span>{/^https?:\/\//.test(quote.sourceUrl) ? <a href={quote.sourceUrl} target="_blank" rel="noreferrer" aria-label={`View ${quote.name} quote source`}><ExternalLink size={12} /></a> : null}</div></article>) || <p>Waiting for market data</p>}</section>)}</div></section> : null}</>;
}
