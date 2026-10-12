import { t as __t, translateValue as __tv, useLocale as __useLocale } from '@/i18n';
'use client';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, RotateCcw, Copy, Check, ClipboardPaste, Undo2 } from 'lucide-react';
import { MAP_DEFAULTS, type MapPaletteKey } from '@/lib/map-palette';
import { applySettings, FONT_MONO, FONT_UI, HEX_RE, clearSettings, loadSavedSettings, PRESETS, readTheme, sanitize, saveSettings, shade, type StyleSettings, } from '@/lib/style-tokens';
/**
 * Style Studio — the panel. All token maths lives in `@/lib/style-tokens`;
 * this file is the controls and the wiring around them.
 */
/* ── Controls ── */
function Row({ label, children }: {
    label: string;
    children: React.ReactNode;
}) {
    __useLocale();
    return (<div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[10px] font-mono tracking-[0.15em] uppercase text-white/40 truncate">{__tv(label)}</span>
      {__tv(children)}
    </div>);
}
function Swatch({ label, value, onChange }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
}) {
    __useLocale();
    return (<label className="relative flex items-center gap-2 cursor-pointer">
      <span className="text-[10px] font-mono uppercase text-white/30 tabular-nums">{__tv(value)}</span>
      <span className="w-7 h-7 rounded-md border border-white/15 shrink-0" style={{ background: value, boxShadow: `0 0 10px ${value}55` }}/>
      <input type="color" value={HEX_RE.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" aria-label={__tv(label)}/>
    </label>);
}
function Slider({ label, value, min, max, step, onChange, format }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
    format?: (v: number) => string;
}) {
    __useLocale();
    return (<div className="flex items-center gap-2 flex-1 max-w-[150px]">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} aria-label={__tv(label)} className="min-w-0 flex-1 h-1 appearance-none rounded-full bg-white/10 accent-[var(--gold-primary)] cursor-pointer"/>
      <span className="text-[10px] font-mono tabular-nums text-white/40 w-9 text-right">
        {__tv(format ? format(value) : value)}
      </span>
    </div>);
}
/**
 * A slider with an explicit AUTO state. AUTO means "emit no rule", which is
 * how an untouched knob leaves the app's own styling intact.
 */
function AutoSlider({ label, value, min, max, step, whenEnabled, onChange, format }: {
    label: string;
    value: number | null;
    min: number;
    max: number;
    step: number;
    whenEnabled: number;
    onChange: (v: number | null) => void;
    format: (v: number) => string;
}) {
    __useLocale();
    const auto = value === null;
    return (<div className="flex items-center gap-1.5 flex-1 max-w-[168px]">
      <button onClick={() => onChange(auto ? whenEnabled : null)} aria-pressed={auto} title={__tv(auto ? `${label}: following the app's own styling` : `${label}: overridden`)} className={`px-1.5 py-0.5 rounded text-[8px] font-mono tracking-wider border transition-colors shrink-0 ${auto
            ? 'border-[var(--border-active)] bg-[var(--gold-primary)]/15 text-[var(--gold-light)]'
            : 'border-white/10 text-white/30 hover:text-white/60'}`}>{__t("AUTO")}</button>
      <input type="range" min={min} max={max} step={step} value={auto ? whenEnabled : value} disabled={auto} onChange={(e) => onChange(parseFloat(e.target.value))} aria-label={__tv(label)} className={`min-w-0 flex-1 h-1 appearance-none rounded-full bg-white/10 accent-[var(--gold-primary)] ${auto ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}/>
      <span className="text-[10px] font-mono tabular-nums text-white/40 w-9 text-right">
        {__tv(auto ? 'auto' : format(value))}
      </span>
    </div>);
}
function Segmented({ label, options, value, onChange }: {
    label: string;
    options: {
        label: string;
        value: string;
    }[];
    value: string;
    onChange: (v: string) => void;
}) {
    __useLocale();
    return (<div className="flex flex-wrap gap-1 justify-end" role="group" aria-label={__tv(label)}>
      {__tv(options.map(o => (<button key={o.label} onClick={() => onChange(o.value)} aria-pressed={value === o.value} className={`px-2 py-1 rounded text-[9px] font-mono tracking-wider border transition-colors ${value === o.value
                ? 'border-[var(--border-active)] bg-[var(--gold-primary)]/15 text-[var(--gold-light)]'
                : 'border-white/10 text-white/35 hover:text-white/60'}`}>
          {__tv(o.label)}
        </button>)))}
    </div>);
}
const ON_OFF = [{ label: 'ON', value: 'on' }, { label: 'OFF', value: 'off' }];
/** Groups rows inside a section without starting a new one. */
function SubHead({ label, note }: {
    label: string;
    note?: string;
}) {
    __useLocale();
    return (<div className="pt-2.5 pb-0.5">
      <div className="text-[9px] font-mono tracking-[0.2em] uppercase text-white/30">{__tv(label)}</div>
      {__tv(note && <div className="text-[8px] font-mono leading-snug text-white/20 pt-0.5">{__tv(note)}</div>)}
    </div>);
}
/**
 * A colour with a default it can be sent back to.
 *
 * The satellite swatches need this more than most: sitting on the default is
 * not just a colour, it is what keeps each satellite's own mission colour, so
 * getting back to it has to be possible without resetting the whole theme.
 */
function ResettableSwatch({ label, value, fallback, onChange }: {
    label: string;
    value: string;
    fallback: string;
    onChange: (v: string) => void;
}) {
    __useLocale();
    const changed = value.toLowerCase() !== fallback.toLowerCase();
    return (<div className="flex items-center gap-1.5">
      <button onClick={() => onChange(fallback)} title={__t("Restore the default {0}", label.toLowerCase())} aria-label={__t("Restore default {0}", label)} className={`w-5 h-5 rounded flex items-center justify-center transition-opacity ${changed ? 'text-white/35 hover:text-white/80 hover:bg-white/5' : 'opacity-0 pointer-events-none'}`}>
        <Undo2 className="w-3 h-3"/>
      </button>
      <Swatch label={__tv(label)} value={value} onChange={onChange}/>
    </div>);
}
function Section({ title, children }: {
    title: string;
    children: React.ReactNode;
}) {
    __useLocale();
    return (<div className="flex flex-col">
      <div className="text-[9px] font-mono tracking-[0.25em] uppercase text-white/25 border-b border-white/[0.07] pb-1 mb-1">
        {__tv(title)}
      </div>
      {__tv(children)}
    </div>);
}
function StyleStudio({ onClose, isMobile }: {
    onClose: () => void;
    isMobile?: boolean;
}) {
    __useLocale();
    const [s, setS] = useState<StyleSettings | null>(null);
    const [copied, setCopied] = useState(false);
    const initialised = useRef(false);
    /**
     * Until the user actually changes something there is nothing to override.
     * Without this, Reset would immediately re-apply a snapshot of the current
     * theme as inline vars — which look identical but pin the palette, so the
     * Ghost Protocol toggle would silently stop doing anything.
     */
    const dirty = useRef(false);
    useEffect(() => {
        if (initialised.current)
            return;
        initialised.current = true;
        const saved = loadSavedSettings();
        if (saved)
            dirty.current = true;
        setS(saved ?? readTheme());
    }, []);
    useEffect(() => {
        if (!s || !dirty.current)
            return;
        applySettings(s);
        /* Debounced: a slider drag fires this on every frame. */
        const t = setTimeout(() => {
            saveSettings(s);
        }, 250);
        return () => clearTimeout(t);
    }, [s]);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape')
            onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    /* While clean, re-seed from the live theme so edits made after a theme
       switch start from what is actually on screen. */
    const edit = useCallback((patch: Partial<StyleSettings> | ((base: StyleSettings) => Partial<StyleSettings>)) => {
        setS(prev => {
            const base = dirty.current && prev ? prev : readTheme();
            return { ...base, ...(typeof patch === 'function' ? patch(base) : patch) };
        });
        dirty.current = true;
    }, []);
    const set = useCallback(<K extends keyof StyleSettings>(key: K, value: StyleSettings[K]) => {
        edit({ [key]: value } as Partial<StyleSettings>);
    }, [edit]);
    /* One layer colour at a time — the rest of the palette has to come from the
       seeded base, not from a render-time copy that may predate a theme switch. */
    const setMap = useCallback((key: MapPaletteKey, value: string) => {
        edit(base => ({ map: { ...base.map, [key]: value } }));
    }, [edit]);
    /* The surface ramp follows the background unless a preset supplies its own. */
    const setBg = useCallback((bg: string) => {
        edit({ bg, bgPrimary: shade(bg, 0.03), bgSecondary: shade(bg, 0.07), bgTertiary: shade(bg, 0.12) });
    }, [edit]);
    const reset = () => {
        dirty.current = false;
        clearSettings();
        applySettings(null);
        setS(readTheme());
    };
    const copy = async () => {
        if (!s)
            return;
        try {
            await navigator.clipboard.writeText(JSON.stringify(s, null, 2));
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        }
        catch { /* clipboard blocked */ }
    };
    const paste = async () => {
        try {
            const text = await navigator.clipboard.readText();
            edit(sanitize(JSON.parse(text), s ?? readTheme()));
        }
        catch { /* not JSON, or clipboard blocked */ }
    };
    if (!s)
        return null;
    /* Portalled to <body>: the rail that renders the trigger carries a
       framer-motion transform, which would otherwise make this fixed panel
       position against the rail instead of the viewport. */
    return createPortal(<motion.div initial={{ opacity: 0, x: isMobile ? 0 : -12, y: isMobile ? 12 : 0 }} animate={{ opacity: 1, x: 0, y: 0 }} exit={{ opacity: 0, x: isMobile ? 0 : -12, y: isMobile ? 12 : 0 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }} className={`z-[400] pointer-events-auto flex flex-col rounded-xl border border-[var(--border-primary)] shadow-[0_16px_48px_rgba(0,0,0,0.7)] ${isMobile ? 'fixed inset-x-3 bottom-3 top-20' : 'fixed left-[58px] bottom-6 w-[340px] max-h-[min(78vh,720px)]'}`} style={{
            background: 'rgba(6, 4, 14, 0.96)',
            backdropFilter: 'blur(28px) saturate(1.2)',
            WebkitBackdropFilter: 'blur(28px) saturate(1.2)',
        }} role="dialog" aria-label={__t("Style Studio")}>
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.07] shrink-0">
        <div className="flex flex-col">
          <span className="text-[11px] font-mono tracking-[0.22em] uppercase text-[var(--gold-light)]">{__t("Style Studio")}</span>
          <span className="text-[9px] font-mono tracking-[0.1em] uppercase text-white/25">{__t("Live UI tokens")}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={paste} title={__t("Paste a shared theme from the clipboard")} aria-label={__t("Paste theme")} className="w-7 h-7 rounded-md flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors">
            <ClipboardPaste className="w-3.5 h-3.5"/>
          </button>
          <button onClick={copy} title={__t("Copy this theme as JSON")} aria-label={__t("Copy theme")} className="w-7 h-7 rounded-md flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors">
            {__tv(copied ? <Check className="w-3.5 h-3.5 text-[var(--alert-green)]"/> : <Copy className="w-3.5 h-3.5"/>)}
          </button>
          <button onClick={reset} title={__t("Reset to the active theme")} aria-label={__t("Reset")} className="w-7 h-7 rounded-md flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors">
            <RotateCcw className="w-3.5 h-3.5"/>
          </button>
          <button onClick={onClose} title={__t("Close")} aria-label={__t("Close Style Studio")} className="w-7 h-7 rounded-md flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors">
            <X className="w-3.5 h-3.5"/>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-3">
        <Section title={__t("Preset")}>
          <div className="grid grid-cols-3 gap-1 pt-1">
            {__tv(PRESETS.map(p => (<button key={p.label} onClick={() => edit(p.patch)} className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-white/10 hover:border-[var(--border-active)] hover:bg-white/5 transition-colors">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.patch.accent, boxShadow: `0 0 6px ${p.patch.accent}` }}/>
                <span className="text-[9px] font-mono tracking-wider text-white/50">{__tv(p.label)}</span>
              </button>)))}
          </div>
        </Section>

        <Section title={__t("Accent")}>
          <Row label={__t("Primary")}><Swatch label={__t("Primary accent")} value={s.accent} onChange={v => set('accent', v)}/></Row>
          <Row label={__t("Secondary")}><Swatch label={__t("Secondary accent")} value={s.accent2} onChange={v => set('accent2', v)}/></Row>
          <Row label={__t("Glow")}><Slider label={__t("Glow strength")} value={s.glow} min={0} max={1} step={0.01} onChange={v => set('glow', v)} format={v => `${Math.round(v * 100)}%`}/></Row>
        </Section>

        <Section title={__t("Signal")}>
          <Row label={__t("Critical")}><Swatch label={__t("Critical colour")} value={s.alertRed} onChange={v => set('alertRed', v)}/></Row>
          <Row label={__t("Warning")}><Swatch label={__t("Warning colour")} value={s.alertOrange} onChange={v => set('alertOrange', v)}/></Row>
          <Row label={__t("Nominal")}><Swatch label={__t("Nominal colour")} value={s.alertGreen} onChange={v => set('alertGreen', v)}/></Row>
          <Row label={__t("Info")}><Swatch label={__t("Info colour")} value={s.alertBlue} onChange={v => set('alertBlue', v)}/></Row>
        </Section>

        <Section title={__t("Map controls")}>
          <Row label={__t("Pan/zoom pad")}>
            <Segmented label={__t("On-screen pan and zoom pad")} options={ON_OFF} value={s.mapControls ? 'on' : 'off'} onChange={v => set('mapControls', v === 'on')}/>
          </Row>
        </Section>

        <Section title={__t("Map layers")}>
          <SubHead label={__t("Cameras")}/>
          <Row label={__t("Dots &amp; labels")}><ResettableSwatch label={__t("Camera colour")} value={s.map.cctv} fallback={MAP_DEFAULTS.cctv} onChange={v => setMap('cctv', v)}/></Row>

          <SubHead label={__t("Satellites")} note="Default keeps each satellite's own mission colour. Change one and it takes over that whole category."/>
          <Row label={__t("Comms")}><ResettableSwatch label={__t("Comms satellites")} value={s.map.satComms} fallback={MAP_DEFAULTS.satComms} onChange={v => setMap('satComms', v)}/></Row>
          <Row label={__t("Military")}><ResettableSwatch label={__t("Military satellites")} value={s.map.satMilitary} fallback={MAP_DEFAULTS.satMilitary} onChange={v => setMap('satMilitary', v)}/></Row>
          <Row label={__t("Navigation")}><ResettableSwatch label={__t("Navigation satellites")} value={s.map.satNavigation} fallback={MAP_DEFAULTS.satNavigation} onChange={v => setMap('satNavigation', v)}/></Row>
          <Row label={__t("Earth obs")}><ResettableSwatch label={__t("Earth observation satellites")} value={s.map.satEarth} fallback={MAP_DEFAULTS.satEarth} onChange={v => setMap('satEarth', v)}/></Row>
          <Row label={__t("Science")}><ResettableSwatch label={__t("Science satellites")} value={s.map.satScience} fallback={MAP_DEFAULTS.satScience} onChange={v => setMap('satScience', v)}/></Row>
          <Row label={__t("Other")}><ResettableSwatch label={__t("Other satellites")} value={s.map.satOther} fallback={MAP_DEFAULTS.satOther} onChange={v => setMap('satOther', v)}/></Row>

          <SubHead label={__t("Aircraft")}/>
          <Row label={__t("Civil")}><ResettableSwatch label={__t("Civil aircraft")} value={s.map.flightCivil} fallback={MAP_DEFAULTS.flightCivil} onChange={v => setMap('flightCivil', v)}/></Row>
          <Row label={__t("Private")}><ResettableSwatch label={__t("Private aircraft")} value={s.map.flightPrivate} fallback={MAP_DEFAULTS.flightPrivate} onChange={v => setMap('flightPrivate', v)}/></Row>
          <Row label={__t("Government")}><ResettableSwatch label={__t("Government aircraft")} value={s.map.flightGov} fallback={MAP_DEFAULTS.flightGov} onChange={v => setMap('flightGov', v)}/></Row>
          <Row label={__t("Military")}><ResettableSwatch label={__t("Military aircraft")} value={s.map.flightMilitary} fallback={MAP_DEFAULTS.flightMilitary} onChange={v => setMap('flightMilitary', v)}/></Row>
          <Row label={__t("Unknown")}><ResettableSwatch label={__t("Unknown aircraft")} value={s.map.flightUnknown} fallback={MAP_DEFAULTS.flightUnknown} onChange={v => setMap('flightUnknown', v)}/></Row>

          <SubHead label={__t("OI")} note="The arcs a forecast draws through the sky."/>
          <Row label={__t("Aligned")}><ResettableSwatch label={__t("OI arcs: aligned or agreeing")} value={s.map.oiSupport} fallback={MAP_DEFAULTS.oiSupport} onChange={v => setMap('oiSupport', v)}/></Row>
          <Row label={__t("Opposed")}><ResettableSwatch label={__t("OI arcs: opposed or disputing")} value={s.map.oiOppose} fallback={MAP_DEFAULTS.oiOppose} onChange={v => setMap('oiOppose', v)}/></Row>
          <Row label={__t("Neutral")}><ResettableSwatch label={__t("OI arcs: neutral, evidence")} value={s.map.oiNeutral} fallback={MAP_DEFAULTS.oiNeutral} onChange={v => setMap('oiNeutral', v)}/></Row>
        </Section>

        <Section title={__t("Surface")}>
          <Row label={__t("Background")}><Swatch label={__t("Background colour")} value={s.bg} onChange={setBg}/></Row>
          <Row label={__t("Panel")}><Slider label={__t("Panel opacity")} value={s.panelAlpha} min={0.2} max={1} step={0.01} onChange={v => set('panelAlpha', v)} format={v => `${Math.round(v * 100)}%`}/></Row>
          <Row label={__t("Border")}><Slider label={__t("Border strength")} value={s.borderAlpha} min={0} max={0.6} step={0.01} onChange={v => set('borderAlpha', v)} format={v => `${Math.round(v * 100)}%`}/></Row>
          <Row label={__t("Blur")}><AutoSlider label={__t("Backdrop blur")} value={s.blur} min={0} max={64} step={1} whenEnabled={24} onChange={v => set('blur', v)} format={v => `${v}px`}/></Row>
          <Row label={__t("Radius")}><Slider label={__t("Corner radius")} value={s.radius} min={0} max={2.5} step={0.05} onChange={v => set('radius', v)} format={v => `${v.toFixed(2)}x`}/></Row>
        </Section>

        <Section title={__t("Text")}>
          <Row label={__t("Primary")}><Swatch label={__t("Primary text")} value={s.textPrimary} onChange={v => set('textPrimary', v)}/></Row>
          <Row label={__t("Secondary")}><Swatch label={__t("Secondary text")} value={s.textSecondary} onChange={v => set('textSecondary', v)}/></Row>
          <Row label={__t("Muted")}><Swatch label={__t("Muted text")} value={s.textMuted} onChange={v => set('textMuted', v)}/></Row>
          <Row label={__t("Heading")}><Swatch label={__t("Heading text")} value={s.textHeading} onChange={v => set('textHeading', v)}/></Row>
        </Section>

        <Section title={__t("Typography")}>
          <Row label={__t("UI font")}><Segmented label={__t("UI font")} options={FONT_UI} value={s.fontUi} onChange={v => set('fontUi', v)}/></Row>
          <Row label={__t("Mono font")}><Segmented label={__t("Mono font")} options={FONT_MONO} value={s.fontMono} onChange={v => set('fontMono', v)}/></Row>
          <Row label={__t("Tracking")}><AutoSlider label={__t("Mono tracking")} value={s.tracking} min={-0.05} max={0.4} step={0.005} whenEnabled={0.2} onChange={v => set('tracking', v)} format={v => `${v.toFixed(2)}em`}/></Row>
        </Section>

        <Section title={__t("Motion & FX")}>
          <Row label={__t("Speed")}><Slider label={__t("Motion speed")} value={s.motion} min={0} max={2} step={0.05} onChange={v => set('motion', v)} format={v => (v === 0 ? 'off' : `${v.toFixed(2)}x`)}/></Row>
          <Row label={__t("Scanlines")}><Slider label={__t("Scanline overlay")} value={s.scanlines} min={0} max={0.2} step={0.005} onChange={v => set('scanlines', v)} format={v => (v === 0 ? 'off' : `${Math.round(v * 500)}%`)}/></Row>
          <Row label={__t("Grain")}><Slider label={__t("Film grain overlay")} value={s.grain} min={0} max={0.3} step={0.005} onChange={v => set('grain', v)} format={v => (v === 0 ? 'off' : `${Math.round(v * 333)}%`)}/></Row>
          <Row label={__t("Vignette")}><Slider label={__t("Edge vignette")} value={s.vignette} min={0} max={1} step={0.01} onChange={v => set('vignette', v)} format={v => (v === 0 ? 'off' : `${Math.round(v * 100)}%`)}/></Row>
        </Section>

        <p className="text-[9px] font-mono leading-relaxed text-white/20 pt-1 pb-1">{__t("Saved to this browser. AUTO leaves the app&apos;s own styling alone, and presets do not touch the map layers &mdash; those carry meaning, not just a look. Reset restores the active theme.")}</p>
      </div>
    </motion.div>, document.body);
}
export default memo(StyleStudio);
