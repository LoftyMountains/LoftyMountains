import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Anchor, Building2, Check, ChevronDown, ChevronRight, CircleHelp, Crosshair, ExternalLink, Factory, Globe2, Landmark, Layers3, Map as MapIcon, MapPin, Newspaper, Radio, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Star, TrendingUp, Waves, X, Zap } from "lucide-react";
import type { EconomicCategory, EconomicNewsItem, EconomicReferencePoint } from "../shared/types";
import { useEconomicSnapshot } from "./hooks/useEconomicSnapshot";
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
const sourceLabels: Record<string, string> = { live: "正常", polling: "采集中", delayed: "延迟", offline: "离线" };
const precisionLabels = { country: "国家中心", region: "地区中心", city: "城市中心" };
const categoryById = new Map(categories.map((category) => [category.id, category]));

function safeUrl(value: string | null | undefined) {
  if (!value) return null;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}

export function App() {
  const [hours, setHours] = useState(24);
  const { snapshot, snapshotHours, error, refreshing, refresh, revision } = useEconomicSnapshot(hours);
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
  const [sourcesOpen, setSourcesOpen] = useState(true);
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
      && (source === "all" || item.source === source) && (!importantOnly || item.important)
      && (!text || `${item.title} ${item.content} ${item.tags.join(" ")} ${item.locations.map((location) => location.label).join(" ")}`.toLocaleLowerCase().includes(text)));
  }, [snapshot, enabledCategories, source, importantOnly, query]);
  const references = useMemo(() => (snapshot?.referencePoints || []).filter((point) => enabledReferences.has(point.kind)), [snapshot, enabledReferences]);
  const selected = items.find((item) => item.id === selectedId) || null;
  const locatedCount = items.filter((item) => item.locations.length > 0).length;
  const locationsCount = new Set(items.flatMap((item) => item.locations.map((location) => location.id))).size;
  const sourceCount = snapshot?.sources.filter((entry) => entry.state === "live").length || 0;
  const stale = !!error || !!snapshot && now - new Date(snapshot.generatedAt).getTime() > 90_000;
  const changingWindow = !!snapshot && snapshotHours !== hours;
  const statusLabel = !snapshot ? (error ? "连接异常" : "正在连接") : stale ? "更新延迟" : sourceCount === 0 ? "等待数据源" : "持续观测";
  const activeFilters = query.trim() || source !== "all" || importantOnly || enabledCategories.size !== categories.length;

  function closeDetail() { setSelectedId(null); setReference(null); lastFocusRef.current?.focus(); }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
      if (event.key === "/" && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault(); setMobilePanel("feed"); setFeedOpen(true); window.setTimeout(() => searchRef.current?.focus(), 0);
      }
      if (event.key === "Escape") { setSelectedId(null); setReference(null); setAboutOpen(false); lastFocusRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { if (selectedId || reference) detailRef.current?.focus({ preventScroll: true }); }, [selectedId, reference]);

  function selectItem(id: string) {
    lastFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedId(id); setReference(null);
    const location = items.find((item) => item.id === id)?.locations[0];
    if (location) { setFocus({ longitude: location.longitude, latitude: location.latitude, zoom: 2.7, key: Date.now() }); setPreset(""); }
  }

  function selectReference(point: EconomicReferencePoint) {
    lastFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setReference(point); setSelectedId(null); setPreset("");
    setFocus({ longitude: point.longitude, latitude: point.latitude, zoom: 2.7, key: Date.now() });
  }

  function toggleCategory(id: EconomicCategory) {
    setEnabledCategories((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function resetFilters() { setQuery(""); setSource("all"); setImportantOnly(false); setEnabledCategories(new Set(categories.map((entry) => entry.id))); }
  const detailUrl = safeUrl(selected?.url || reference?.sourceUrl);

  return <main className={`economic-app mobile-${mobilePanel} ${layersOpen ? "" : "is-layers-collapsed"} ${feedOpen ? "" : "is-feed-collapsed"}`}>
    <header className="economic-header">
      <a className="economic-brand" href="#" aria-label="景行全球经济情报首页" onClick={(event) => { event.preventDefault(); resetFilters(); closeDetail(); setMobilePanel("map"); setPreset("全球"); setFocus({ ...presets[0], key: Date.now() }); }}><span className="economic-brand-symbol" aria-hidden="true"><i /><i /><i /></span><span><strong>景行<span>JINGXING</span></strong><small>GLOBAL ECONOMIC INTELLIGENCE</small></span></a>
      <div className="economic-header-divider" /><span className="economic-product-label">全球经济情报</span>
      <div className="economic-header-end"><span className={`economic-connection ${stale || !sourceCount ? "is-delayed" : ""}`} role="status"><i />{statusLabel}</span><div className="economic-header-clock"><time dateTime={new Date(now).toISOString()}>{formatClock(now)}</time><span>北京时间 UTC+8</span></div><button type="button" className={`economic-icon-button ${refreshing ? "is-refreshing" : ""}`} aria-label={refreshing ? "正在刷新" : "刷新全部数据"} title="刷新全部数据" disabled={refreshing} onClick={refresh}><RefreshCw size={16} /></button><button type="button" className={`economic-icon-button ${aboutOpen ? "is-active" : ""}`} aria-label="数据与使用说明" aria-expanded={aboutOpen} onClick={() => setAboutOpen((value) => !value)}><CircleHelp size={17} /></button></div>
    </header>

    <div className="economic-map-stage"><Suspense fallback={<div className="economic-scene-loading" role="status"><Globe2 size={40} /><span>正在构建全球视野</span></div>}><EconomicMap items={items} referencePoints={references} selectedId={selected?.id || null} onSelect={selectItem} onSelectReference={selectReference} projection={projection} focus={focus} /></Suspense></div>
    <div className="economic-map-toolbar" aria-label="地图视图"><div className="economic-projection-switch" role="group" aria-label="地图投影"><button type="button" aria-pressed={projection === "globe"} title="地球视图" onClick={() => setProjection("globe")}><Globe2 size={15} /><span>地球</span></button><button type="button" aria-pressed={projection === "mercator"} title="平面地图" onClick={() => setProjection("mercator")}><MapIcon size={15} /><span>平面</span></button></div><span className="economic-toolbar-separator" /><div className="economic-presets" role="group" aria-label="地图区域">{presets.map((entry) => <button type="button" key={entry.label} aria-pressed={preset === entry.label} onClick={() => { setPreset(entry.label); setFocus({ longitude: entry.longitude, latitude: entry.latitude, zoom: entry.zoom, key: Date.now() }); }}>{entry.label}</button>)}</div></div>

    <aside className="economic-layers economic-panel" aria-label="经济图层与来源">
      <div className="economic-panel-heading"><div><Layers3 size={15} /><h1>经济图层</h1></div><span className="economic-section-code">LAYERS</span><button type="button" className="economic-panel-collapse" aria-label="收起经济图层" onClick={() => setLayersOpen(false)}><ChevronRight size={14} /></button></div>
      <div className="economic-layer-intro"><span>从全球事件，读懂经济脉动</span><strong>{snapshot ? snapshot.coverage.economicCount.toLocaleString() : "—"}<small> 条经济消息 · {snapshotHours}H</small></strong></div>
      <div className="economic-section-label"><span>消息主题</span><button type="button" onClick={() => setEnabledCategories(enabledCategories.size === categories.length ? new Set() : new Set(categories.map((entry) => entry.id)))}>{enabledCategories.size === categories.length ? "全部关闭" : "全部开启"}</button></div>
      <div className="economic-category-list">{categories.map(({ id, label, color, icon: Icon }) => <button type="button" className="economic-layer" style={{ "--category-color": color } as CSSProperties} key={id} aria-pressed={enabledCategories.has(id)} onClick={() => toggleCategory(id)}><span className="economic-layer-icon"><Icon size={16} /></span><span className="economic-layer-name">{label}</span><span className="economic-layer-count">{snapshot?.categories.find((category) => category.id === id)?.count ?? "—"}</span><span className="economic-toggle" aria-hidden="true"><i /></span></button>)}</div>
      <div className="economic-section-label"><span>经济基础设施</span><span className="economic-static-label">静态参考</span></div>
      <div className="economic-reference-list">{referenceLayers.map(({ id, label, icon: Icon }) => <button type="button" key={id} className="economic-reference-layer" aria-pressed={enabledReferences.has(id)} onClick={() => setEnabledReferences((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })}><Icon size={14} /><span>{label}</span><span className="economic-check" aria-hidden="true">{enabledReferences.has(id) ? <Check size={11} /> : null}</span></button>)}</div>
      <div className="economic-layer-summary"><div><strong>{locatedCount}</strong><span>有地区线索</span></div><div><strong>{locationsCount}</strong><span>关联地区</span></div></div>
      <section className="economic-source-section"><button type="button" className="economic-source-heading" aria-expanded={sourcesOpen} onClick={() => setSourcesOpen((value) => !value)}><span><Radio size={13} />数据源状态</span><span>{sourceCount}/{snapshot?.sources.length || 5}<ChevronDown size={13} className={sourcesOpen ? "is-open" : ""} /></span></button>{sourcesOpen ? <div className="economic-source-list">{snapshot?.sources.map((entry) => <div className="economic-source" key={entry.id} title={entry.message || (entry.lastSuccessAt ? `最后采集 ${formatFull(entry.lastSuccessAt)}` : "等待首次采集")}><span><i className={`is-${entry.state}`} />{entry.label}</span><small>{sourceLabels[entry.state]}</small></div>) || <p>正在连接财经数据源…</p>}</div> : null}</section>
      <p className="economic-layer-note"><ShieldCheck size={12} /><span>消息来源可追溯<br />地图标记为正文提及地区</span></p>
    </aside>

    <aside className="economic-feed economic-panel" aria-labelledby="economic-feed-title">
      <div className="economic-panel-heading"><div><Newspaper size={15} /><h2 id="economic-feed-title">经济快讯</h2><span className="economic-count-badge">{items.length}</span></div><span className={`economic-feed-live ${stale || !snapshot ? "is-delayed" : ""}`}><i />{!snapshot ? "CONNECTING" : stale ? "DELAYED" : "LIVE FEED"}</span><button type="button" className="economic-panel-collapse" aria-label="收起经济快讯" onClick={() => setFeedOpen(false)}><ChevronRight size={14} /></button></div>
      <div className="economic-feed-filters"><label className="economic-search"><Search size={15} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索事件、地区、关键词" aria-label="搜索经济消息" />{query ? <button type="button" aria-label="清空搜索" onClick={() => { setQuery(""); searchRef.current?.focus(); }}><X size={13} /></button> : <kbd>/</kbd>}</label><div className="economic-feed-controls"><div className="economic-periods" role="group" aria-label="消息时间范围">{[6, 24, 72].map((value) => <button type="button" key={value} aria-pressed={hours === value} onClick={() => setHours(value)}>{value}H</button>)}</div><label className="economic-source-filter"><span className="sr-only">消息来源</span><select value={source} onChange={(event) => setSource(event.target.value)}><option value="all">全部来源</option>{snapshot?.sources.map((entry) => <option value={entry.id} key={entry.id}>{entry.label}</option>)}</select><ChevronDown size={12} /></label><button type="button" className="economic-important-filter" aria-pressed={importantOnly} title="仅看重点消息" aria-label="仅看重点消息" onClick={() => setImportantOnly((value) => !value)}><Star size={14} /></button></div></div>
      {error || changingWindow ? <div className="economic-feed-warning" role="status">{error || `正在加载 ${hours}H 消息…`}{snapshot ? ` · 暂保留 ${snapshotHours}H 数据` : ""}{error ? <button type="button" disabled={refreshing} onClick={refresh}>重试</button> : null}</div> : null}
      <div className="economic-feed-summary"><span>{activeFilters ? "筛选结果" : "按发布时间排序"}</span><span>{items.length} 条{snapshot?.coverage.truncated ? " · 已达窗口上限" : ""}</span></div>
      <div className="economic-feed-scroll" aria-busy={!snapshot && refreshing}>{!snapshot && refreshing ? <div className="economic-feed-skeleton" aria-label="消息加载中">{[1, 2, 3, 4, 5].map((key) => <div key={key}><i /><b /><span /><span /></div>)}</div> : items.length ? <ol className="economic-news-list">{items.map((item) => <NewsCard key={item.id} item={item} selected={selected?.id === item.id} now={now} onSelect={selectItem} />)}</ol> : <div className="economic-feed-empty"><Search size={25} /><strong>{snapshot ? "没有符合条件的消息" : "暂时无法获取经济快讯"}</strong><p>{snapshot ? "调整主题、来源或时间范围，继续探索全球经济动态。" : error || "数据源正在准备中，请稍后刷新。"}</p>{activeFilters ? <button type="button" onClick={resetFilters}>清除筛选</button> : <button type="button" disabled={refreshing} onClick={refresh}>重新获取</button>}</div>}</div>
      <div className="economic-feed-footer"><span><span className="economic-small-dot" />每 30 秒自动更新</span><span>{snapshot ? `更新于 ${formatClock(snapshot.generatedAt)}` : "等待同步"}</span></div>
    </aside>

    {!layersOpen ? <nav className="economic-layer-rail economic-panel" aria-label="折叠经济图层"><button type="button" aria-label="展开经济图层" title="展开经济图层" onClick={() => setLayersOpen(true)}><Layers3 size={18} /></button>{categories.map(({ id, label, color, icon: Icon }) => <button type="button" key={id} title={label} aria-label={label} aria-pressed={enabledCategories.has(id)} onClick={() => toggleCategory(id)} style={{ "--category-color": color } as CSSProperties}><Icon size={17} /></button>)}</nav> : null}
    {!feedOpen ? <nav className="economic-feed-rail economic-panel" aria-label="折叠经济快讯"><button type="button" aria-label="展开经济快讯" title="展开经济快讯" onClick={() => setFeedOpen(true)}><Newspaper size={18} /><span>{items.length}</span></button><button type="button" aria-label="打开消息搜索" title="打开消息搜索" onClick={() => { setFeedOpen(true); window.setTimeout(() => searchRef.current?.focus(), 0); }}><Search size={17} /></button><button type="button" aria-label="数据与使用说明" title="数据与使用说明" onClick={() => setAboutOpen(true)}><CircleHelp size={17} /></button></nav> : null}

    {selected || reference ? <section className="economic-detail economic-panel" ref={detailRef} tabIndex={-1} aria-labelledby="economic-detail-title"><div className="economic-detail-eyebrow"><span><Crosshair size={12} />{selected ? "EVENT INTELLIGENCE" : "ECONOMIC INFRASTRUCTURE"}</span><button type="button" className="economic-icon-button" aria-label="关闭详情" onClick={closeDetail}><X size={15} /></button></div><h2 id="economic-detail-title">{selected?.title || reference?.name}</h2>
      {selected ? <><div className="economic-detail-meta"><span>{selected.sourceLabel}</span><time dateTime={selected.publishedAt}>{formatFull(selected.publishedAt)}</time></div><div className="economic-detail-tags">{selected.categories.map((id) => <span key={id} style={{ color: categoryById.get(id)?.color }}>{categoryById.get(id)?.label}</span>)}{selected.important ? <span className="is-important"><Star size={11} />重点</span> : null}</div><p className="economic-detail-content">{selected.content || selected.title}</p><div className="economic-location-evidence"><strong><MapPin size={12} />地区线索</strong>{selected.locations.length ? selected.locations.map((location) => <div key={location.id}><span>{location.label}<small>{precisionLabels[location.precision]}</small></span><p>正文匹配：{location.matchedTerms.join("、")}</p></div>) : <p>正文未识别到明确地区。保留在消息列表，不在地图上推测落点。</p>}<small>标记表示文章提及地区，不是事件的精确发生位置。</small></div></> : <><div className="economic-detail-tags"><span>静态参考 · {referenceLayers.find((layer) => layer.id === reference?.kind)?.label}</span></div><p className="economic-detail-content">{reference?.description}</p><p className="economic-detail-reference-note">经济地理背景参考，不表示实时吞吐量、运行状态或当前事件。</p></>}
      <div className="economic-detail-bottom"><span>{selected ? "原始报道 · 北京时间" : "公开地理资料"}</span>{detailUrl ? <a href={detailUrl} target="_blank" rel="noreferrer">{selected ? "阅读原文" : "查看参考来源"}<ExternalLink size={12} /></a> : <span>暂无原文链接</span>}</div></section> : null}

    {aboutOpen ? <section className="economic-about economic-panel" role="dialog" aria-labelledby="economic-about-title"><div className="economic-panel-heading"><h2 id="economic-about-title">关于经济情报</h2><button type="button" className="economic-icon-button" aria-label="关闭说明" onClick={() => setAboutOpen(false)}><X size={16} /></button></div><p>{snapshot?.methodology || "聚合公开财经来源，按经济主题整理消息；以正文明确提及的地区生成地图线索。"}</p><p>来源状态反映采集结果。更新延迟时保留最近一次数据；行情时间与消息时间各自显示。</p><p>{snapshot?.coverage.truncated ? `当前窗口返回最近 ${snapshot.coverage.returnedCount} 条经济消息。` : ""}搜索与图层筛选作用于已加载消息。</p><p>金融中心、港口和贸易通道为静态参考。聚合与分类不构成事实核验或投资建议。</p><div><kbd>/</kbd> 搜索消息 <kbd>Esc</kbd> 关闭详情</div></section> : null}

    <EconomicMarkets revision={revision} />
    <nav className="economic-mobile-nav" aria-label="工作台面板"><button type="button" aria-pressed={mobilePanel === "map"} onClick={() => setMobilePanel("map")}><Globe2 size={17} />地图</button><button type="button" aria-pressed={mobilePanel === "feed"} onClick={() => setMobilePanel("feed")}><Newspaper size={17} />快讯<span>{items.length}</span></button><button type="button" aria-pressed={mobilePanel === "layers"} onClick={() => setMobilePanel("layers")}><SlidersHorizontal size={17} />图层</button></nav>
  </main>;
}

function NewsCard({ item, selected, now, onSelect }: { item: EconomicNewsItem; selected: boolean; now: number; onSelect: (id: string) => void }) {
  const category = categoryById.get(item.categories[0]);
  return <li><button type="button" className={`economic-news-card ${selected ? "is-selected" : ""}`} aria-pressed={selected} onClick={() => onSelect(item.id)} style={{ "--category-color": category?.color || "#d6b779" } as CSSProperties}><div className="economic-news-meta"><span className="economic-news-source"><i />{item.sourceLabel}</span><time dateTime={item.publishedAt} title={formatFull(item.publishedAt)}>{relativeTime(item.publishedAt, now)}</time></div><h3>{item.important ? <Star size={11} className="economic-news-star" aria-label="重点消息" /> : null}{item.title}</h3><div className="economic-news-bottom"><span>{category?.label || "经济动态"}</span><span className="economic-news-region"><MapPin size={10} />{item.locations[0]?.label || "地区未确认"}{item.locations.length > 1 ? ` +${item.locations.length - 1}` : ""}</span><ChevronRight size={12} /></div></button></li>;
}
