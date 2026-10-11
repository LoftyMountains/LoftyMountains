import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Anchor, Building2, Check, ChevronDown, ChevronRight, CircleHelp, CloudLightning, Crosshair, ExternalLink, Factory, Globe2, Landmark, Layers3, Map as MapIcon, MapPin, Newspaper, RefreshCw, Satellite, ShieldPlus, Ship, Search, ShieldCheck, SlidersHorizontal, Star, TrendingUp, Waves, X, Zap } from "lucide-react";
import type { EconomicCategory, EconomicNewsItem, EconomicReferencePoint, MapLayerId } from "../shared/types";
import { useEconomicSnapshot } from "./hooks/useEconomicSnapshot";
import { useMapOverlays } from "./hooks/useMapOverlays";
import { useSourceCatalog } from "./hooks/useSourceCatalog";
import { SourceCatalog, SourceCatalogSummary } from "./components/SourceCatalog";
import { NewsEvidenceDetail, evidenceLabels } from "./components/NewsEvidenceDetail";
import "./source-catalog.css";
import { MapLayerPanel, MapLegend, mapLayers } from "./components/MapLayerPanel";
import { MapFeatureDetail } from "./components/MapFeatureDetail";
import "./map-layers.css";
import { EconomicMarkets } from "./components/EconomicMarkets";
import { formatClock, formatFull, relativeTime } from "./lib/time";

const EconomicMap = lazy(() => import("./components/EconomicMap").then((module) => ({ default: module.EconomicMap })));
const categories = [
  { id: "macro", label: "Macroeconomics", color: "#d6b779", icon: Globe2 },
  { id: "monetary", label: "Central banks", color: "#b09be9", icon: Landmark },
  { id: "markets", label: "Financial markets", color: "#78b6d4", icon: TrendingUp },
  { id: "trade", label: "Trade & supply chains", color: "#76bdaa", icon: Anchor },
  { id: "energy", label: "Energy & commodities", color: "#d99c72", icon: Zap },
  { id: "industry", label: "Industry & companies", color: "#c292a4", icon: Factory },
  { id: "weather", label: "Weather & disasters", color: "#7bb9cc", icon: CloudLightning },
  { id: "transport", label: "Shipping & routes", color: "#86bfab", icon: Ship },
  { id: "satellite", label: "Satellite observations", color: "#aaa3d9", icon: Satellite },
  { id: "health", label: "Public health", color: "#d3a1a6", icon: ShieldPlus },
] as const;
const referenceLayers = [
  { id: "financial-center", label: "Financial centers", icon: Building2 },
  { id: "port", label: "Major ports", icon: Anchor },
  { id: "chokepoint", label: "Trade corridors", icon: Waves },
] as const;
const presets = [
  { label: "Global", longitude: 70, latitude: 20, zoom: 2.1 },
  { label: "Asia", longitude: 110, latitude: 25, zoom: 2.4 },
  { label: "Europe", longitude: 15, latitude: 45, zoom: 2.55 },
  { label: "Americas", longitude: -85, latitude: 20, zoom: 2.35 },
];
const precisionLabels = { country: "Country center", region: "Regional center", city: "City center" };
const categoryById = new Map(categories.map((category) => [category.id, category]));

function safeUrl(value: string | null | undefined) {
  if (!value) return null;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}

export function App() {
  const hours = 24;
  const { snapshot, error, refreshing, refresh, revision } = useEconomicSnapshot(hours);
  const overlays = useMapOverlays();
  const catalog = useSourceCatalog();
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSourceId, setCatalogSourceId] = useState<string | null>(null);
  const [enabledMapLayers, setEnabledMapLayers] = useState<Set<MapLayerId>>(() => new Set(mapLayers.map(layer => layer.id)));
  const [newsMapVisible, setNewsMapVisible] = useState(false);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [enabledCategories, setEnabledCategories] = useState<Set<EconomicCategory>>(() => new Set(categories.map((entry) => entry.id)));
  const [enabledReferences, setEnabledReferences] = useState<Set<EconomicReferencePoint["kind"]>>(() => new Set(["financial-center", "port", "chokepoint"]));
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [importantOnly, setImportantOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reference, setReference] = useState<EconomicReferencePoint | null>(null);
  const [projection, setProjection] = useState<"globe" | "mercator">("globe");
  const [focus, setFocus] = useState<{ longitude: number; latitude: number; zoom?: number; key: number } | null>(null);
  const [preset, setPreset] = useState("Global");
  const [mobilePanel, setMobilePanel] = useState<"map" | "feed" | "layers">("map");
  const [layersOpen, setLayersOpen] = useState(true);
  const [feedOpen, setFeedOpen] = useState(true);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const searchRef = useRef<HTMLInputElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = "dark";
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.content = "#080d12";
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  const items = useMemo(() => {
    const text = query.trim().toLocaleLowerCase();
    return (snapshot?.items || []).filter((item) => item.categories.some((category) => enabledCategories.has(category))
      && (source === "all" || (source.startsWith("kind:") ? item.evidence?.kind === source.slice(5) : item.source === source)) && (!importantOnly || item.important)
      && (!text || `${item.title} ${item.content} ${item.tags.join(" ")} ${item.locations.map((location) => location.label).join(" ")}`.toLocaleLowerCase().includes(text)));
  }, [snapshot, enabledCategories, source, importantOnly, query]);
  const mapTimeBucket = Math.floor(now / 30_000);
  const mapFeatures = useMemo(() => (overlays.snapshot?.features || []).filter(feature => {
    if (!enabledMapLayers.has(feature.properties.layer)) return false;
    const time = feature.properties.layer === "aviation" ? feature.properties.sourceTime : feature.properties.layer === "satellites" ? feature.properties.positionTime : null;
    return !time || mapTimeBucket * 30_000 - Date.parse(time) <= 20 * 60_000;
  }), [overlays.snapshot, enabledMapLayers, mapTimeBucket]);
  const selectedFeature = mapFeatures.find(feature => feature.id === selectedFeatureId) || null;
  const references = useMemo(() => (snapshot?.referencePoints || []).filter((point) => enabledReferences.has(point.kind)), [snapshot, enabledReferences]);
  const selected = items.find((item) => item.id === selectedId) || null;
  const locatedCount = items.filter((item) => item.locations.length > 0).length;
  const locationsCount = new Set(items.flatMap((item) => item.locations.map((location) => location.id))).size;
  const sourceCount = snapshot?.sources.filter((entry) => entry.state === "live").length || 0;
  const stale = !!error || !!snapshot && now - new Date(snapshot.generatedAt).getTime() > 90_000;
  const catalogNewsKinds = useMemo(() => new Map((catalog.snapshot?.sources || []).filter(entry => entry.products.includes("news"))
    .map(entry => [entry.id, entry.role === "primary" ? "primary-release" : entry.role === "observation" ? "aggregated-event" : "media-report"])), [catalog.snapshot]);
  const groupedSourceIds = new Set((snapshot?.sources || []).filter(entry => {
    const kind = catalogNewsKinds.get(entry.id) || (["gdacs", "eonet"].includes(entry.id) ? "aggregated-event" : entry.kind === "official" ? "primary-release" : "media-report");
    return kind === source.slice(5);
  }).map(entry => entry.id));
  const relevantSources = (snapshot?.sources || []).filter((entry) => source === "all" || (source.startsWith("kind:") ? groupedSourceIds.has(entry.id) : entry.id === source));
  const sortedSources = useMemo(() => [...(snapshot?.sources || [])].sort((a, b) => Number(b.kind === "official") - Number(a.kind === "official")), [snapshot?.sources]);
  const failedSources = relevantSources.filter((entry) => entry.state === "delayed" || entry.state === "offline");
  const feedState = !snapshot ? "CONNECTING" : stale ? "DELAYED"
    : relevantSources.length && failedSources.length === relevantSources.length
      ? relevantSources.every((entry) => entry.state === "offline") ? "OFFLINE" : "DELAYED"
      : failedSources.length ? "PARTIAL" : relevantSources.some((entry) => entry.lastSuccessAt) ? "LIVE FEED" : "CONNECTING";
  const statusLabel = !snapshot ? (error ? "Connection issue" : "Connecting") : stale ? "Delayed" : sourceCount === 0 ? "Waiting for sources" : "Monitoring";
  const activeFilters = query.trim() || source !== "all" || importantOnly || enabledCategories.size !== categories.length;

  function closeDetail() { setSelectedId(null); setSelectedFeatureId(null); setReference(null); lastFocusRef.current?.focus(); }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      const target = event.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
      if (event.key === "/" && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault(); setMobilePanel("feed"); setFeedOpen(true); window.setTimeout(() => searchRef.current?.focus(), 0);
      }
      if (event.key === "Escape") { setSelectedId(null); setSelectedFeatureId(null); setReference(null); setAboutOpen(false); lastFocusRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { if (selectedId || reference) detailRef.current?.focus({ preventScroll: true }); }, [selectedId, reference]);

  function selectItem(id: string) {
    lastFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedId(id); setReference(null); setSelectedFeatureId(null);
    const location = items.find((item) => item.id === id)?.locations[0];
    if (location) { setFocus({ longitude: location.longitude, latitude: location.latitude, zoom: 2.7, key: Date.now() }); setPreset(""); }
  }

  function selectReference(point: EconomicReferencePoint) {
    lastFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setReference(point); setSelectedId(null); setSelectedFeatureId(null); setPreset("");
    setFocus({ longitude: point.longitude, latitude: point.latitude, zoom: 2.7, key: Date.now() });
  }

  function selectMapFeature(id: string) {
    const feature = mapFeatures.find(feature => feature.id === id);
    if (!feature) return;
    lastFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedFeatureId(id); setSelectedId(null); setReference(null); setPreset(""); setMobilePanel("map");
    setFocus({ longitude: feature.properties.anchor[0], latitude: feature.properties.anchor[1], zoom: feature.properties.layer === "satellites" ? 2.1 : 3, key: Date.now() });
  }
  function openMapNews(id: string) {
    setQuery(""); setSource("all"); setImportantOnly(false); setEnabledCategories(new Set(categories.map(entry => entry.id)));
    setSelectedFeatureId(null); setSelectedId(id); setReference(null);
  }
  function toggleMapLayer(id: MapLayerId) {
    setEnabledMapLayers(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function refreshAll() { refresh(); overlays.refresh(); catalog.refresh(); }
  function openSourceCatalog(id: string | null = null) { setCatalogSourceId(id); setCatalogOpen(true); }

  function toggleCategory(id: EconomicCategory) {
    setEnabledCategories((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function resetFilters() { setQuery(""); setSource("all"); setImportantOnly(false); setEnabledCategories(new Set(categories.map((entry) => entry.id))); }
  const detailUrl = safeUrl(selected?.url || reference?.sourceUrl);

  return <main className={`economic-app ${selectedFeature ? "has-map-detail" : ""} mobile-${mobilePanel} ${layersOpen ? "" : "is-layers-collapsed"} ${feedOpen ? "" : "is-feed-collapsed"}`}>
    <header className="economic-header">
      <a className="economic-brand" href="#" aria-label="Jingxing Global Economic Intelligence home" onClick={(event) => { event.preventDefault(); resetFilters(); closeDetail(); setMobilePanel("map"); setPreset("Global"); setFocus({ ...presets[0], key: Date.now() }); }}><span className="economic-brand-symbol" aria-hidden="true"><i /><i /><i /></span><span><strong>JINGXING</strong><small>GLOBAL ECONOMIC INTELLIGENCE</small></span></a>
      <div className="economic-header-divider" /><span className="economic-product-label">Global Economic Intelligence</span>
      <div className="economic-header-end"><span className={`economic-connection ${stale || !sourceCount ? "is-delayed" : ""}`} role="status"><i />{statusLabel}</span><div className="economic-header-clock"><time dateTime={new Date(now).toISOString()}>{formatClock(now)}</time><span>UTC+8</span></div><button type="button" className={`economic-icon-button ${refreshing ? "is-refreshing" : ""}`} aria-label={refreshing ? "Refreshing" : "Refresh all data"} title="Refresh all data" disabled={refreshing || overlays.refreshing} onClick={refreshAll}><RefreshCw size={16} /></button><button type="button" className={`economic-icon-button ${aboutOpen ? "is-active" : ""}`} aria-label="Data and usage guide" aria-expanded={aboutOpen} onClick={() => setAboutOpen((value) => !value)}><CircleHelp size={17} /></button></div>
    </header>

    <div className="economic-map-stage"><Suspense fallback={<div className="economic-scene-loading" role="status"><Globe2 size={40} /><span>Loading the global view</span></div>}><EconomicMap items={newsMapVisible ? items : []} features={mapFeatures} selectedFeatureId={selectedFeature?.id || null} onSelectFeature={selectMapFeature} referencePoints={references} selectedId={selected?.id || null} onSelect={selectItem} onSelectReference={selectReference} projection={projection} focus={focus} /></Suspense></div>
    <div className="economic-map-toolbar" aria-label="Map view"><div className="economic-projection-switch" role="group" aria-label="Map projection"><button type="button" aria-pressed={projection === "globe"} title="Globe view" onClick={() => setProjection("globe")}><Globe2 size={15} /><span>Globe</span></button><button type="button" aria-pressed={projection === "mercator"} title="Flat map" onClick={() => setProjection("mercator")}><MapIcon size={15} /><span>Flat</span></button></div><span className="economic-toolbar-separator" /><div className="economic-presets" role="group" aria-label="Map region">{presets.map((entry) => <button type="button" key={entry.label} aria-pressed={preset === entry.label} onClick={() => { setPreset(entry.label); setFocus({ longitude: entry.longitude, latitude: entry.latitude, zoom: entry.zoom, key: Date.now() }); }}>{entry.label}</button>)}</div></div>

    <aside className="economic-layers economic-panel" aria-label="Intelligence layers and sources">
      <div className="economic-panel-heading"><div><Layers3 size={15} /><h1>Layers</h1></div><span className="economic-section-code">INTELLIGENCE</span><button type="button" className="economic-panel-collapse" aria-label="Collapse intelligence layers" onClick={() => setLayersOpen(false)}><ChevronRight size={14} /></button></div>
      <div className="economic-layer-intro"><span>Global events. Economic context.</span><strong>{overlays.snapshot ? mapFeatures.length.toLocaleString("en-US") : "—"}<small> map objects · current snapshot</small></strong></div>
      <MapLayerPanel snapshot={overlays.snapshot} error={overlays.error} enabled={enabledMapLayers} onToggle={toggleMapLayer} newsVisible={newsMapVisible} onNewsToggle={() => setNewsMapVisible(value => !value)} newsCount={locatedCount} refreshing={overlays.refreshing} onRefresh={overlays.refresh} />
      <div className="economic-section-label"><span>News topics</span><button type="button" onClick={() => setEnabledCategories(enabledCategories.size === categories.length ? new Set() : new Set(categories.map((entry) => entry.id)))}>{enabledCategories.size === categories.length ? "Disable all" : "Enable all"}</button></div>
      <div className="economic-category-list">{categories.map(({ id, label, color, icon: Icon }) => <button type="button" className="economic-layer" style={{ "--category-color": color } as CSSProperties} key={id} aria-pressed={enabledCategories.has(id)} onClick={() => toggleCategory(id)}><span className="economic-layer-icon"><Icon size={16} /></span><span className="economic-layer-name">{label}</span><span className="economic-layer-count">{snapshot?.categories.find((category) => category.id === id)?.count ?? "—"}</span><span className="economic-toggle" aria-hidden="true"><i /></span></button>)}</div>
      <div className="economic-section-label"><span>Infrastructure</span><span className="economic-static-label">Static reference</span></div>
      <div className="economic-reference-list">{referenceLayers.map(({ id, label, icon: Icon }) => <button type="button" key={id} className="economic-reference-layer" aria-pressed={enabledReferences.has(id)} onClick={() => setEnabledReferences((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })}><Icon size={14} /><span>{label}</span><span className="economic-check" aria-hidden="true">{enabledReferences.has(id) ? <Check size={11} /> : null}</span></button>)}</div>
      <div className="economic-layer-summary"><div><strong>{locatedCount}</strong><span>With location clues</span></div><div><strong>{locationsCount}</strong><span>Linked regions</span></div></div>
      <SourceCatalogSummary snapshot={catalog.snapshot} error={catalog.error} refreshing={catalog.refreshing} onOpen={() => openSourceCatalog()} />
      <p className="economic-layer-note"><ShieldCheck size={12} /><span>Traceable sources<br />Independent spatial layers</span></p>
    </aside>

    <MapLegend enabled={enabledMapLayers} newsVisible={newsMapVisible} />
    <aside className="economic-feed economic-panel" aria-labelledby="economic-feed-title">
      <div className="economic-panel-heading"><div><Newspaper size={15} /><h2 id="economic-feed-title">Global news</h2><span className="economic-count-badge">{items.length}</span></div><span className={`economic-feed-live ${feedState !== "LIVE FEED" ? "is-delayed" : ""}`} title={failedSources.length ? "Some sources have collection issues. Check individual source status." : "Collection status; individual records may have been published earlier"}><i />{feedState}</span><button type="button" className="economic-panel-collapse" aria-label="Collapse global news" onClick={() => setFeedOpen(false)}><ChevronRight size={14} /></button></div>
      <div className="economic-feed-filters"><label className="economic-search"><Search size={15} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events, places, keywords" aria-label="Search intelligence news" />{query ? <button type="button" aria-label="Clear search" onClick={() => { setQuery(""); searchRef.current?.focus(); }}><X size={13} /></button> : <kbd>/</kbd>}</label><div className="economic-feed-controls"><span className="economic-snapshot-label" title="Each collection replaces the current snapshot. No history is stored.">Current snapshot</span><label className="economic-source-filter"><span className="sr-only">News source</span><select value={source} onChange={(event) => setSource(event.target.value)}><option value="all">All sources</option><optgroup label="Evidence type"><option value="kind:primary-release">Primary releases</option><option value="kind:media-report">Media reports</option><option value="kind:aggregated-event">Event compilations</option></optgroup><optgroup label="Individual sources">{sortedSources.map((entry) => <option value={entry.id} key={entry.id}>{entry.label}</option>)}</optgroup></select><ChevronDown size={12} /></label><button type="button" className="economic-important-filter" aria-pressed={importantOnly} title="Show highlighted news only" aria-label="Show highlighted news only" onClick={() => setImportantOnly((value) => !value)}><Star size={14} /></button></div></div>
      {error ? <div className="economic-feed-warning" role="status">{error}{snapshot ? " · Showing the last successful snapshot" : ""}{error ? <button type="button" disabled={refreshing} onClick={refresh}>Retry</button> : null}</div> : null}
      {source !== "all" && failedSources.length ? <div className="economic-feed-warning" role="status">{source.startsWith("kind:") ? "Some sources in this group are " : "This source is "}{failedSources[0]?.state === "offline" ? "offline" : "delayed"}. {failedSources[0]?.lastSuccessAt ? "Showing the last successful snapshot. Check the original publication time." : "No successful snapshot yet. Try again later or visit the source."}</div> : null}
      {snapshot?.storage && snapshot.storage.state !== "normal" ? <div className="economic-feed-warning" role="status">{snapshot.storage.message}</div> : null}
      <div className="economic-feed-summary"><span>{activeFilters ? "Filtered results" : "By publication time"}</span><span>{items.length} records{snapshot?.coverage.truncated ? " · display limit reached" : ""}</span></div>
      <div className="economic-feed-scroll" aria-busy={!snapshot && refreshing}>{!snapshot && refreshing ? <div className="economic-feed-skeleton" aria-label="Loading news">{[1, 2, 3, 4, 5].map((key) => <div key={key}><i /><b /><span /><span /></div>)}</div> : items.length ? <ol className="economic-news-list">{items.map((item) => <NewsCard key={item.id} item={item} selected={selected?.id === item.id} now={now} onSelect={selectItem} />)}</ol> : <div className="economic-feed-empty"><Search size={25} /><strong>{snapshot ? "No matching news" : "Global news is unavailable"}</strong><p>{snapshot ? "Adjust topics or sources. Some official releases are infrequent, so a healthy source may have no current records." : error || "Sources are loading. Please refresh shortly."}</p>{activeFilters ? <button type="button" onClick={resetFilters}>Clear filters</button> : <button type="button" disabled={refreshing} onClick={refresh}>Try again</button>}</div>}</div>
      <div className="economic-feed-footer"><span><span className="economic-small-dot" />Sync every 30s</span><span>{snapshot ? `Updated ${formatClock(snapshot.generatedAt)} UTC+8` : "Waiting for sync"}</span></div>
    </aside>

    {!layersOpen ? <nav className="economic-layer-rail economic-panel" aria-label="Collapsed intelligence layers"><button type="button" aria-label="Expand intelligence layers" title="Expand intelligence layers" onClick={() => setLayersOpen(true)}><Layers3 size={18} /></button>{categories.map(({ id, label, color, icon: Icon }) => <button type="button" key={id} title={label} aria-label={label} aria-pressed={enabledCategories.has(id)} onClick={() => toggleCategory(id)} style={{ "--category-color": color } as CSSProperties}><Icon size={17} /></button>)}</nav> : null}
    {!feedOpen ? <nav className="economic-feed-rail economic-panel" aria-label="Collapsed global news"><button type="button" aria-label="Expand global news" title="Expand global news" onClick={() => setFeedOpen(true)}><Newspaper size={18} /><span>{items.length}</span></button><button type="button" aria-label="Open news search" title="Open news search" onClick={() => { setFeedOpen(true); window.setTimeout(() => searchRef.current?.focus(), 0); }}><Search size={17} /></button><button type="button" aria-label="Data and usage guide" title="Data and usage guide" onClick={() => setAboutOpen(true)}><CircleHelp size={17} /></button></nav> : null}

    {selectedFeature ? <MapFeatureDetail feature={selectedFeature} detailRef={detailRef} onClose={closeDetail} onNews={openMapNews} onSource={openSourceCatalog} /> : null}
    {selected || reference ? <section className="economic-detail economic-panel" ref={detailRef} tabIndex={-1} aria-labelledby="economic-detail-title"><div className="economic-detail-eyebrow"><span><Crosshair size={12} />{selected ? "EVENT INTELLIGENCE" : "ECONOMIC INFRASTRUCTURE"}</span><button type="button" className="economic-icon-button" aria-label="Close details" onClick={closeDetail}><X size={15} /></button></div><h2 id="economic-detail-title">{selected?.title || reference?.name}</h2>
      {selected ? <><div className="economic-detail-meta"><span>{selected.sourceLabel}</span><time dateTime={selected.publishedAt}>{formatFull(selected.publishedAt)}</time></div><div className="economic-detail-tags">{selected.categories.map((id) => <span key={id} style={{ color: categoryById.get(id)?.color }}>{categoryById.get(id)?.label}</span>)}{selected.important ? <span className="is-important"><Star size={11} />Highlighted</span> : null}</div><p className="economic-detail-content">{selected.content || selected.title}</p><p className="economic-detail-source-note">{snapshot?.sources.find((entry) => entry.id === selected.source)?.description}</p>{!selected.evidence ? <div className="economic-location-evidence"><strong><MapPin size={12} />Location clues</strong>{selected.locations.length ? selected.locations.map((location) => <div key={location.id}><span>{location.label}<small>{precisionLabels[location.precision]}</small></span><p>Text matches: {location.matchedTerms.join(", ")}</p></div>) : <p>No clear location was identified in the text. The news remains in the feed without an inferred map position.</p>}<small>Markers show places mentioned in the article, not precise event locations.</small></div> : null}<NewsEvidenceDetail item={selected} onSource={openSourceCatalog} /></> : <><div className="economic-detail-tags"><span>Static reference · {referenceLayers.find((layer) => layer.id === reference?.kind)?.label}</span></div><p className="economic-detail-content">{reference?.description}</p><p className="economic-detail-reference-note">Economic geography reference. It does not show live throughput, operational status or current events.</p></>}
      <div className="economic-detail-bottom"><span>{selected ? "Source time · UTC+8" : "Public geographic data"}</span>{detailUrl ? <a href={detailUrl} target="_blank" rel="noreferrer">{selected ? "Read original" : "View reference source"}<ExternalLink size={12} /></a> : <span>No original link</span>}</div></section> : null}

    {aboutOpen ? <section className="economic-about economic-panel" role="dialog" aria-labelledby="economic-about-title"><div className="economic-panel-heading"><h2 id="economic-about-title">About this intelligence</h2><button type="button" className="economic-icon-button" aria-label="Close guide" onClick={() => setAboutOpen(false)}><X size={16} /></button></div><p>{snapshot?.methodology || "Official releases and newsroom reports, organized by economic and public-risk topics. Map clues reflect places explicitly mentioned in the text."}</p><p>Official releases provide first-party records; media reports add context. Source status reflects collection health, not independent verification. Only the current in-memory snapshot is retained. Refreshes replace it and restarts clear it; no history or backups are stored.</p><p>{snapshot?.coverage.truncated ? `The current snapshot shows the latest ${snapshot.coverage.returnedCount} records. ` : ""}Search and topic filters apply to loaded news.</p><p>Map layers are independent of news filters. Weather uses source coordinates and areas; aviation shows sampled last-observed positions; shipping routes are static references. Satellite locations and tracks are orbital predictions. Health markers use approximate centers of regions mentioned in advisories. News count markers can be enabled separately. Alerts and advisories do not establish confirmed losses. Aggregation and classification are not fact-checking or investment advice.</p><div><kbd>/</kbd> Search news <kbd>Esc</kbd> Close details</div></section> : null}

    <SourceCatalog snapshot={catalog.snapshot} error={catalog.error} refreshing={catalog.refreshing} onRefresh={catalog.refresh} open={catalogOpen} initialSourceId={catalogSourceId} onClose={() => setCatalogOpen(false)} />
    <EconomicMarkets revision={revision} />
    <nav className="economic-mobile-nav" aria-label="Workspace panels"><button type="button" aria-pressed={mobilePanel === "map"} onClick={() => setMobilePanel("map")}><Globe2 size={17} />Map</button><button type="button" aria-pressed={mobilePanel === "feed"} onClick={() => setMobilePanel("feed")}><Newspaper size={17} />News<span>{items.length}</span></button><button type="button" aria-pressed={mobilePanel === "layers"} onClick={() => setMobilePanel("layers")}><SlidersHorizontal size={17} />Layers</button></nav>
  </main>;
}

function NewsCard({ item, selected, now, onSelect }: { item: EconomicNewsItem; selected: boolean; now: number; onSelect: (id: string) => void }) {
  const category = categoryById.get(item.categories[0]);
  return <li><button type="button" className={`economic-news-card ${selected ? "is-selected" : ""}`} aria-pressed={selected} onClick={() => onSelect(item.id)} style={{ "--category-color": category?.color || "#d6b779" } as CSSProperties}><div className="economic-news-meta"><span className="economic-news-source"><i />{item.sourceLabel}</span><time dateTime={item.publishedAt} title={formatFull(item.publishedAt)}>{relativeTime(item.publishedAt, now)}</time></div>{item.evidence ? <span className="news-evidence-kind">{evidenceLabels[item.evidence.kind]}</span> : null}<h3>{item.important ? <Star size={11} className="economic-news-star" aria-label="Highlighted news" /> : null}{item.title}</h3><div className="economic-news-bottom"><span>{category?.label || "Economic news"}</span><span className="economic-news-region"><MapPin size={10} />{item.locations[0]?.label || "Location unknown"}{item.locations.length > 1 ? ` +${item.locations.length - 1}` : ""}</span><ChevronRight size={12} /></div></button></li>;
}
