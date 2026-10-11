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
  { id: "macro", label: "宏观经济", color: "#d6b779", icon: Globe2 },
  { id: "monetary", label: "央行与货币", color: "#b09be9", icon: Landmark },
  { id: "markets", label: "金融市场", color: "#78b6d4", icon: TrendingUp },
  { id: "trade", label: "贸易与供应链", color: "#76bdaa", icon: Anchor },
  { id: "energy", label: "能源与商品", color: "#d99c72", icon: Zap },
  { id: "industry", label: "产业与公司", color: "#c292a4", icon: Factory },
  { id: "weather", label: "气象灾害", color: "#7bb9cc", icon: CloudLightning },
  { id: "transport", label: "航运航线", color: "#86bfab", icon: Ship },
  { id: "satellite", label: "卫星观测", color: "#aaa3d9", icon: Satellite },
  { id: "health", label: "公共卫生", color: "#d3a1a6", icon: ShieldPlus },
] as const;
const referenceLayers = [
  { id: "financial-center", label: "金融中心", icon: Building2 },
  { id: "port", label: "主要港口", icon: Anchor },
  { id: "chokepoint", label: "贸易通道", icon: Waves },
] as const;
const presets = [
  { label: "全球", longitude: 70, latitude: 20, zoom: 2.1 },
  { label: "亚洲", longitude: 110, latitude: 25, zoom: 2.4 },
  { label: "欧洲", longitude: 15, latitude: 45, zoom: 2.55 },
  { label: "美洲", longitude: -85, latitude: 20, zoom: 2.35 },
];
const precisionLabels = { country: "国家中心", region: "地区中心", city: "城市中心" };
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
  const [preset, setPreset] = useState("全球");
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
  const statusLabel = !snapshot ? (error ? "连接异常" : "正在连接") : stale ? "更新延迟" : sourceCount === 0 ? "等待数据源" : "持续观测";
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
      <a className="economic-brand" href="#" aria-label="景行全球经济情报首页" onClick={(event) => { event.preventDefault(); resetFilters(); closeDetail(); setMobilePanel("map"); setPreset("全球"); setFocus({ ...presets[0], key: Date.now() }); }}><span className="economic-brand-symbol" aria-hidden="true"><i /><i /><i /></span><span><strong>景行<span>JINGXING</span></strong><small>GLOBAL ECONOMIC INTELLIGENCE</small></span></a>
      <div className="economic-header-divider" /><span className="economic-product-label">全球经济情报</span>
      <div className="economic-header-end"><span className={`economic-connection ${stale || !sourceCount ? "is-delayed" : ""}`} role="status"><i />{statusLabel}</span><div className="economic-header-clock"><time dateTime={new Date(now).toISOString()}>{formatClock(now)}</time><span>北京时间 UTC+8</span></div><button type="button" className={`economic-icon-button ${refreshing ? "is-refreshing" : ""}`} aria-label={refreshing ? "正在刷新" : "刷新全部数据"} title="刷新全部数据" disabled={refreshing || overlays.refreshing} onClick={refreshAll}><RefreshCw size={16} /></button><button type="button" className={`economic-icon-button ${aboutOpen ? "is-active" : ""}`} aria-label="数据与使用说明" aria-expanded={aboutOpen} onClick={() => setAboutOpen((value) => !value)}><CircleHelp size={17} /></button></div>
    </header>

    <div className="economic-map-stage"><Suspense fallback={<div className="economic-scene-loading" role="status"><Globe2 size={40} /><span>正在构建全球视野</span></div>}><EconomicMap items={newsMapVisible ? items : []} features={mapFeatures} selectedFeatureId={selectedFeature?.id || null} onSelectFeature={selectMapFeature} referencePoints={references} selectedId={selected?.id || null} onSelect={selectItem} onSelectReference={selectReference} projection={projection} focus={focus} /></Suspense></div>
    <div className="economic-map-toolbar" aria-label="地图视图"><div className="economic-projection-switch" role="group" aria-label="地图投影"><button type="button" aria-pressed={projection === "globe"} title="地球视图" onClick={() => setProjection("globe")}><Globe2 size={15} /><span>地球</span></button><button type="button" aria-pressed={projection === "mercator"} title="平面地图" onClick={() => setProjection("mercator")}><MapIcon size={15} /><span>平面</span></button></div><span className="economic-toolbar-separator" /><div className="economic-presets" role="group" aria-label="地图区域">{presets.map((entry) => <button type="button" key={entry.label} aria-pressed={preset === entry.label} onClick={() => { setPreset(entry.label); setFocus({ longitude: entry.longitude, latitude: entry.latitude, zoom: entry.zoom, key: Date.now() }); }}>{entry.label}</button>)}</div></div>

    <aside className="economic-layers economic-panel" aria-label="情报图层与来源">
      <div className="economic-panel-heading"><div><Layers3 size={15} /><h1>情报图层</h1></div><span className="economic-section-code">LAYERS</span><button type="button" className="economic-panel-collapse" aria-label="收起情报图层" onClick={() => setLayersOpen(false)}><ChevronRight size={14} /></button></div>
      <div className="economic-layer-intro"><span>从全球事件，读懂经济脉动</span><strong>{overlays.snapshot ? mapFeatures.length.toLocaleString() : "—"}<small> 个地图对象 · 当前快照</small></strong></div>
      <MapLayerPanel snapshot={overlays.snapshot} error={overlays.error} enabled={enabledMapLayers} onToggle={toggleMapLayer} newsVisible={newsMapVisible} onNewsToggle={() => setNewsMapVisible(value => !value)} newsCount={locatedCount} refreshing={overlays.refreshing} onRefresh={overlays.refresh} />
      <div className="economic-section-label"><span>快讯主题筛选</span><button type="button" onClick={() => setEnabledCategories(enabledCategories.size === categories.length ? new Set() : new Set(categories.map((entry) => entry.id)))}>{enabledCategories.size === categories.length ? "全部关闭" : "全部开启"}</button></div>
      <div className="economic-category-list">{categories.map(({ id, label, color, icon: Icon }) => <button type="button" className="economic-layer" style={{ "--category-color": color } as CSSProperties} key={id} aria-pressed={enabledCategories.has(id)} onClick={() => toggleCategory(id)}><span className="economic-layer-icon"><Icon size={16} /></span><span className="economic-layer-name">{label}</span><span className="economic-layer-count">{snapshot?.categories.find((category) => category.id === id)?.count ?? "—"}</span><span className="economic-toggle" aria-hidden="true"><i /></span></button>)}</div>
      <div className="economic-section-label"><span>经济基础设施</span><span className="economic-static-label">静态参考</span></div>
      <div className="economic-reference-list">{referenceLayers.map(({ id, label, icon: Icon }) => <button type="button" key={id} className="economic-reference-layer" aria-pressed={enabledReferences.has(id)} onClick={() => setEnabledReferences((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })}><Icon size={14} /><span>{label}</span><span className="economic-check" aria-hidden="true">{enabledReferences.has(id) ? <Check size={11} /> : null}</span></button>)}</div>
      <div className="economic-layer-summary"><div><strong>{locatedCount}</strong><span>有地区线索</span></div><div><strong>{locationsCount}</strong><span>关联地区</span></div></div>
      <SourceCatalogSummary snapshot={catalog.snapshot} error={catalog.error} refreshing={catalog.refreshing} onOpen={() => openSourceCatalog()} />
      <p className="economic-layer-note"><ShieldCheck size={12} /><span>消息来源可追溯<br />点、线、面图层可独立切换</span></p>
    </aside>

    <MapLegend enabled={enabledMapLayers} newsVisible={newsMapVisible} />
    <aside className="economic-feed economic-panel" aria-labelledby="economic-feed-title">
      <div className="economic-panel-heading"><div><Newspaper size={15} /><h2 id="economic-feed-title">全球快讯</h2><span className="economic-count-badge">{items.length}</span></div><span className={`economic-feed-live ${feedState !== "LIVE FEED" ? "is-delayed" : ""}`} title={failedSources.length ? "部分来源采集异常，请查看各来源状态" : "来源采集状态；不代表每条通报刚刚发布"}><i />{feedState}</span><button type="button" className="economic-panel-collapse" aria-label="收起全球快讯" onClick={() => setFeedOpen(false)}><ChevronRight size={14} /></button></div>
      <div className="economic-feed-filters"><label className="economic-search"><Search size={15} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索事件、地区、关键词" aria-label="搜索情报消息" />{query ? <button type="button" aria-label="清空搜索" onClick={() => { setQuery(""); searchRef.current?.focus(); }}><X size={13} /></button> : <kbd>/</kbd>}</label><div className="economic-feed-controls"><span className="economic-snapshot-label" title="每次采集替换当前消息，不保存历史">当前快照</span><label className="economic-source-filter"><span className="sr-only">消息来源</span><select value={source} onChange={(event) => setSource(event.target.value)}><option value="all">全部来源</option><optgroup label="证据性质"><option value="kind:primary-release">机构原文</option><option value="kind:media-report">媒体报道</option><option value="kind:aggregated-event">事件汇编</option></optgroup><optgroup label="单个来源">{sortedSources.map((entry) => <option value={entry.id} key={entry.id}>{entry.label}</option>)}</optgroup></select><ChevronDown size={12} /></label><button type="button" className="economic-important-filter" aria-pressed={importantOnly} title="仅看重点消息" aria-label="仅看重点消息" onClick={() => setImportantOnly((value) => !value)}><Star size={14} /></button></div></div>
      {error ? <div className="economic-feed-warning" role="status">{error}{snapshot ? " · 暂显示上次成功快照" : ""}{error ? <button type="button" disabled={refreshing} onClick={refresh}>重试</button> : null}</div> : null}
      {source !== "all" && failedSources.length ? <div className="economic-feed-warning" role="status">{source.startsWith("kind:") ? "所选分组部分来源采集" : "该来源采集"}{failedSources[0]?.state === "offline" ? "离线" : "延迟"}，{failedSources[0]?.lastSuccessAt ? "当前展示上次成功快照；请核对原始通报时间。" : "暂无成功快照，请稍后刷新或查看来源原站。"}</div> : null}
      {snapshot?.storage && snapshot.storage.state !== "normal" ? <div className="economic-feed-warning" role="status">{snapshot.storage.message}</div> : null}
      <div className="economic-feed-summary"><span>{activeFilters ? "筛选结果" : "按发布时间排序"}</span><span>{items.length} 条{snapshot?.coverage.truncated ? " · 已达显示上限" : ""}</span></div>
      <div className="economic-feed-scroll" aria-busy={!snapshot && refreshing}>{!snapshot && refreshing ? <div className="economic-feed-skeleton" aria-label="消息加载中">{[1, 2, 3, 4, 5].map((key) => <div key={key}><i /><b /><span /><span /></div>)}</div> : items.length ? <ol className="economic-news-list">{items.map((item) => <NewsCard key={item.id} item={item} selected={selected?.id === item.id} now={now} onSelect={selectItem} />)}</ol> : <div className="economic-feed-empty"><Search size={25} /><strong>{snapshot ? "没有符合条件的消息" : "暂时无法获取全球快讯"}</strong><p>{snapshot ? "调整主题或来源；部分官方通报不会每日发布，采集正常也可能暂无消息。" : error || "数据源正在准备中，请稍后刷新。"}</p>{activeFilters ? <button type="button" onClick={resetFilters}>清除筛选</button> : <button type="button" disabled={refreshing} onClick={refresh}>重新获取</button>}</div>}</div>
      <div className="economic-feed-footer"><span><span className="economic-small-dot" />每 30 秒同步快照</span><span>{snapshot ? `更新于 ${formatClock(snapshot.generatedAt)}` : "等待同步"}</span></div>
    </aside>

    {!layersOpen ? <nav className="economic-layer-rail economic-panel" aria-label="折叠情报图层"><button type="button" aria-label="展开情报图层" title="展开情报图层" onClick={() => setLayersOpen(true)}><Layers3 size={18} /></button>{categories.map(({ id, label, color, icon: Icon }) => <button type="button" key={id} title={label} aria-label={label} aria-pressed={enabledCategories.has(id)} onClick={() => toggleCategory(id)} style={{ "--category-color": color } as CSSProperties}><Icon size={17} /></button>)}</nav> : null}
    {!feedOpen ? <nav className="economic-feed-rail economic-panel" aria-label="折叠全球快讯"><button type="button" aria-label="展开全球快讯" title="展开全球快讯" onClick={() => setFeedOpen(true)}><Newspaper size={18} /><span>{items.length}</span></button><button type="button" aria-label="打开消息搜索" title="打开消息搜索" onClick={() => { setFeedOpen(true); window.setTimeout(() => searchRef.current?.focus(), 0); }}><Search size={17} /></button><button type="button" aria-label="数据与使用说明" title="数据与使用说明" onClick={() => setAboutOpen(true)}><CircleHelp size={17} /></button></nav> : null}

    {selectedFeature ? <MapFeatureDetail feature={selectedFeature} detailRef={detailRef} onClose={closeDetail} onNews={openMapNews} onSource={openSourceCatalog} /> : null}
    {selected || reference ? <section className="economic-detail economic-panel" ref={detailRef} tabIndex={-1} aria-labelledby="economic-detail-title"><div className="economic-detail-eyebrow"><span><Crosshair size={12} />{selected ? "EVENT INTELLIGENCE" : "ECONOMIC INFRASTRUCTURE"}</span><button type="button" className="economic-icon-button" aria-label="关闭详情" onClick={closeDetail}><X size={15} /></button></div><h2 id="economic-detail-title">{selected?.title || reference?.name}</h2>
      {selected ? <><div className="economic-detail-meta"><span>{selected.sourceLabel}</span><time dateTime={selected.publishedAt}>{formatFull(selected.publishedAt)}</time></div><div className="economic-detail-tags">{selected.categories.map((id) => <span key={id} style={{ color: categoryById.get(id)?.color }}>{categoryById.get(id)?.label}</span>)}{selected.important ? <span className="is-important"><Star size={11} />重点</span> : null}</div><p className="economic-detail-content">{selected.content || selected.title}</p><p className="economic-detail-source-note">{snapshot?.sources.find((entry) => entry.id === selected.source)?.description}</p>{!selected.evidence ? <div className="economic-location-evidence"><strong><MapPin size={12} />地区线索</strong>{selected.locations.length ? selected.locations.map((location) => <div key={location.id}><span>{location.label}<small>{precisionLabels[location.precision]}</small></span><p>正文匹配：{location.matchedTerms.join("、")}</p></div>) : <p>正文未识别到明确地区。保留在消息列表，不在地图上推测落点。</p>}<small>标记表示文章提及地区，不是事件的精确发生位置。</small></div> : null}<NewsEvidenceDetail item={selected} onSource={openSourceCatalog} /></> : <><div className="economic-detail-tags"><span>静态参考 · {referenceLayers.find((layer) => layer.id === reference?.kind)?.label}</span></div><p className="economic-detail-content">{reference?.description}</p><p className="economic-detail-reference-note">经济地理背景参考，不表示实时吞吐量、运行状态或当前事件。</p></>}
      <div className="economic-detail-bottom"><span>{selected ? "来源时间 · 北京时间" : "公开地理资料"}</span>{detailUrl ? <a href={detailUrl} target="_blank" rel="noreferrer">{selected ? "阅读原文" : "查看参考来源"}<ExternalLink size={12} /></a> : <span>暂无原文链接</span>}</div></section> : null}

    {aboutOpen ? <section className="economic-about economic-panel" role="dialog" aria-labelledby="economic-about-title"><div className="economic-panel-heading"><h2 id="economic-about-title">关于经济情报</h2><button type="button" className="economic-icon-button" aria-label="关闭说明" onClick={() => setAboutOpen(false)}><X size={16} /></button></div><p>{snapshot?.methodology || "聚合官方与媒体来源，按经济和公共风险主题整理消息；以正文明确提及的地区生成地图线索。"}</p><p>官方发布用于查阅机构原文，媒体报道用于补充经济事件。来源状态反映采集结果，采集正常不等于内容已独立核验。仅保留各来源当前消息的内存快照，刷新替换，重启清空，不保存历史或备份。</p><p>{snapshot?.coverage.truncated ? `当前快照显示最近 ${snapshot.coverage.returnedCount} 条消息。` : ""}搜索与图层筛选作用于已加载消息。</p><p>地图图层独立于快讯筛选。气象使用来源坐标与范围，航空显示最近一次观测的抽样位置，航运线为静态通道示意，在轨卫星为轨道推算的地面投影与预测轨迹，卫生符号为通报涉及地区的近似中心。新闻数字标记可单独开启。气象预警和卫生通报不等于已确认损失。聚合与分类不构成事实核验或投资建议。</p><div><kbd>/</kbd> 搜索消息 <kbd>Esc</kbd> 关闭详情</div></section> : null}

    <SourceCatalog snapshot={catalog.snapshot} error={catalog.error} refreshing={catalog.refreshing} onRefresh={catalog.refresh} open={catalogOpen} initialSourceId={catalogSourceId} onClose={() => setCatalogOpen(false)} />
    <EconomicMarkets revision={revision} />
    <nav className="economic-mobile-nav" aria-label="工作台面板"><button type="button" aria-pressed={mobilePanel === "map"} onClick={() => setMobilePanel("map")}><Globe2 size={17} />地图</button><button type="button" aria-pressed={mobilePanel === "feed"} onClick={() => setMobilePanel("feed")}><Newspaper size={17} />快讯<span>{items.length}</span></button><button type="button" aria-pressed={mobilePanel === "layers"} onClick={() => setMobilePanel("layers")}><SlidersHorizontal size={17} />图层</button></nav>
  </main>;
}

function NewsCard({ item, selected, now, onSelect }: { item: EconomicNewsItem; selected: boolean; now: number; onSelect: (id: string) => void }) {
  const category = categoryById.get(item.categories[0]);
  return <li><button type="button" className={`economic-news-card ${selected ? "is-selected" : ""}`} aria-pressed={selected} onClick={() => onSelect(item.id)} style={{ "--category-color": category?.color || "#d6b779" } as CSSProperties}><div className="economic-news-meta"><span className="economic-news-source"><i />{item.sourceLabel}</span><time dateTime={item.publishedAt} title={formatFull(item.publishedAt)}>{relativeTime(item.publishedAt, now)}</time></div>{item.evidence ? <span className="news-evidence-kind">{evidenceLabels[item.evidence.kind]}</span> : null}<h3>{item.important ? <Star size={11} className="economic-news-star" aria-label="重点消息" /> : null}{item.title}</h3><div className="economic-news-bottom"><span>{category?.label || "经济动态"}</span><span className="economic-news-region"><MapPin size={10} />{item.locations[0]?.label || "地区未确认"}{item.locations.length > 1 ? ` +${item.locations.length - 1}` : ""}</span><ChevronRight size={12} /></div></button></li>;
}
