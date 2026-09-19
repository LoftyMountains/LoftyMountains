import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import {
  Activity,
  Globe2,
  Layers3,
  MapPin,
  Maximize2,
  Minus,
  Newspaper,
  Plus,
  SunMedium,
  X,
  type LucideIcon,
} from "lucide-react";
import type { FeedNewsItem, MarketSnapshot } from "../../shared/types";
import { formatFull } from "../lib/time";

type LayerId = "base" | "day-night" | "news-events" | "domestic" | "night-lights";
type ItemLayerId = Exclude<LayerId, "base" | "day-night">;
type ItemKind = "event" | "news" | "light-raster";
type Precision = "country" | "region" | "city" | "raster" | "unknown";
type LayerState = "loading" | "updated" | "delayed" | "stale" | "unavailable" | "static-calculated";
type LayerGroup = "基础" | "公开事件" | "中国相关" | "历史观测";

interface LayerDefinition {
  id: LayerId;
  label: string;
  group: LayerGroup;
  icon: LucideIcon;
  color: string;
  description: string;
  status: "固定演示" | "本地计算";
  state: LayerState;
  source: string;
  attribution: string;
  coverage: string;
  cadence: string;
  productDate?: string;
  url?: string;
}

interface SituationItem {
  id: string;
  layer: ItemLayerId;
  kind: ItemKind;
  lon: number | null;
  lat: number | null;
  label: string;
  detail: string;
  region: string;
  precision: Precision;
  severity: "low" | "medium" | "high";
  source: string;
  attribution: string;
  observedAt: string | null;
  updatedAt: string;
  url?: string;
  demoLevel?: 1 | 2 | 3;
  brightnessBand?: "低" | "中" | "高";
}

const PREVIEW_UPDATED_AT = "2026-09-10T08:00:00+08:00";
const NIGHT_LIGHT_PRODUCT_DATE = "2024-01";

const layerDefinitions: LayerDefinition[] = [
  {
    id: "base",
    label: "世界底图",
    group: "基础",
    icon: Globe2,
    color: "#72b8dc",
    description: "景行本地简化轮廓、海岸线与经纬网；参考 Natural Earth 风格",
    status: "固定演示",
    state: "stale",
    source: "景行本地简化轮廓",
    attribution: "手写演示几何；参考 Natural Earth 风格，不是 Natural Earth 数据文件",
    coverage: "全球",
    cadence: "固定预览",
    url: "https://www.naturalearthdata.com/",
  },
  {
    id: "day-night",
    label: "昼夜分界",
    group: "基础",
    icon: Globe2,
    color: "#9a9df5",
    description: "按当前 UTC 计算的近似昼夜分界线",
    status: "本地计算",
    state: "static-calculated",
    source: "景行本地计算",
    attribution: "依据 UTC 时钟计算，非外部观测",
    coverage: "全球",
    cadence: "随本地时钟重算",
  },
  {
    id: "news-events",
    label: "全球公开事件",
    group: "公开事件",
    icon: Newspaper,
    color: "#63b9f5",
    description: "GDELT 参考来源的固定示例，不代表实时事件或全球覆盖",
    status: "固定演示",
    state: "stale",
    source: "GDELT 2.1 参考来源",
    attribution: "无对应实时事件记录；景行本地固定示例，仅用于交互演示",
    coverage: "全球示例点",
    cadence: "未连接实时源",
    url: "https://www.gdeltproject.org/",
  },
  {
    id: "domestic",
    label: "中国相关快讯",
    group: "中国相关",
    icon: MapPin,
    color: "#e7b566",
    description: "中国大陆中文快讯固定示例；港澳台及非财经事件未接入，无法证明地点时不落点",
    status: "固定演示",
    state: "stale",
    source: "景行中文快讯（固定示例）",
    attribution: "界面结构参考中文财经来源；当前条目没有对应实时原文",
    coverage: "中国大陆示例；港澳台未接入",
    cadence: "固定预览，不主动刷新",
  },
  {
    id: "night-lights",
    label: "全球灯光亮度",
    group: "历史观测",
    icon: SunMedium,
    color: "#f7d58b",
    description: "低分辨率历史夜间灯光视觉占位；非实时亮度、非真实栅格测量",
    status: "固定演示",
    state: "stale",
    source: "NASA Black Marble（产品设计参考）",
    attribution: "VNP46A3 仅作产品口径参考；当前为景行视觉占位夹具",
    coverage: "全球示例网格",
    cadence: "月度/历史产品",
    productDate: NIGHT_LIGHT_PRODUCT_DATE,
    url: "https://blackmarble.gsfc.nasa.gov/",
  },
];

const layerStateLabels: Record<LayerState, string> = {
  loading: "加载中",
  updated: "已更新",
  delayed: "延迟",
  stale: "固定演示/可能陈旧",
  unavailable: "暂不可用",
  "static-calculated": "本地计算",
};

const eventFixtures: SituationItem[] = [
  {
    id: "event-tokyo",
    layer: "news-events",
    kind: "event",
    lon: 139.7,
    lat: 35.7,
    label: "东京 · 市场事件（示例）",
    detail: "公开事件聚合点，用于验证地图筛选和详情交互；无对应实时事件记录，不代表事实核验。",
    region: "日本",
    precision: "city",
    severity: "medium",
    source: "GDELT 2.1 参考来源（景行固定示例）",
    attribution: "无对应实时事件记录；仅用于交互演示",
    observedAt: "2026-09-10T00:30:00Z",
    updatedAt: PREVIEW_UPDATED_AT,
    url: "https://www.gdeltproject.org/",
  },
  {
    id: "event-new-york",
    layer: "news-events",
    kind: "event",
    lon: -74,
    lat: 40.7,
    label: "纽约 · 利率与科技（示例）",
    detail: "公开事件聚合点，用于验证多区域信息浏览；没有对应实时事件记录或原文，不代表实时行情信号。",
    region: "美国",
    precision: "city",
    severity: "medium",
    source: "GDELT 2.1 参考来源（景行固定示例）",
    attribution: "无对应实时事件记录；仅用于交互演示",
    observedAt: "2026-09-09T20:00:00Z",
    updatedAt: PREVIEW_UPDATED_AT,
    url: "https://www.gdeltproject.org/",
  },
  {
    id: "event-london",
    layer: "news-events",
    kind: "event",
    lon: -0.1,
    lat: 51.5,
    label: "伦敦 · 金融节点（示例）",
    detail: "公开事件聚合点，位置为城市级交互示例；没有对应实时事件记录或原文，不表示新闻原文坐标。",
    region: "英国",
    precision: "city",
    severity: "low",
    source: "GDELT 2.1 参考来源（景行固定示例）",
    attribution: "无对应实时事件记录；仅用于交互演示",
    observedAt: "2026-09-09T14:00:00Z",
    updatedAt: PREVIEW_UPDATED_AT,
    url: "https://www.gdeltproject.org/",
  },
  {
    id: "event-singapore",
    layer: "news-events",
    kind: "event",
    lon: 103.8,
    lat: 1.3,
    label: "新加坡 · 供应链（示例）",
    detail: "公开事件聚合点，位置和摘要仅用于预览地图信息层；没有对应实时事件记录或原文。",
    region: "新加坡",
    precision: "city",
    severity: "low",
    source: "GDELT 2.1 参考来源（景行固定示例）",
    attribution: "无对应实时事件记录；仅用于交互演示",
    observedAt: "2026-09-09T11:00:00Z",
    updatedAt: PREVIEW_UPDATED_AT,
    url: "https://www.gdeltproject.org/",
  },
  {
    id: "event-sao-paulo",
    layer: "news-events",
    kind: "event",
    lon: -46.6,
    lat: -23.5,
    label: "圣保罗 · 大宗商品（示例）",
    detail: "公开事件聚合点，位置为城市级交互示例；没有对应实时事件记录或原文，不构成投资建议。",
    region: "巴西",
    precision: "city",
    severity: "low",
    source: "GDELT 2.1 参考来源（景行固定示例）",
    attribution: "无对应实时事件记录；仅用于交互演示",
    observedAt: "2026-09-08T21:30:00Z",
    updatedAt: PREVIEW_UPDATED_AT,
    url: "https://www.gdeltproject.org/",
  },
];

// Domestic examples are intentionally frozen for this prototype. They keep
// the country, city and unknown-location precision states visible without
// treating a keyword match in a live headline as a verified event coordinate.
const domesticFixtures: SituationItem[] = [
  {
    id: "domestic-country",
    layer: "domestic",
    kind: "news",
    lon: 105,
    lat: 35,
    label: "中国大陆 · 中文快讯聚合（示例）",
    detail: "中国大陆国家级聚合夹具，用于验证来源、时间和精度展示；标记位于区域示意中心，不代表当前实时数量或真实事件坐标。",
    region: "中国大陆",
    precision: "country",
    severity: "low",
    source: "财联社（参考来源主页）",
    attribution: "景行本地固定夹具；没有对应实时原文，链接仅用于说明参考来源",
    observedAt: "2026-09-10T02:00:00Z",
    updatedAt: PREVIEW_UPDATED_AT,
    url: "https://www.cls.cn/telegraph",
  },
  {
    id: "domestic-city",
    layer: "domestic",
    kind: "news",
    lon: 121.47,
    lat: 31.23,
    label: "上海 · 城市精度交互样本",
    detail: "城市精度固定夹具；标记使用上海市级示意中心，只验证 city 精度的阅读方式，不是快讯原文坐标或实时事件。",
    region: "上海",
    precision: "city",
    severity: "low",
    source: "华尔街见闻（参考来源主页）",
    attribution: "景行本地固定夹具；没有对应实时原文，未连接实时上游",
    observedAt: "2026-09-09T06:30:00Z",
    updatedAt: PREVIEW_UPDATED_AT,
    url: "https://wallstreetcn.com/live/global",
  },
  {
    id: "domestic-region",
    layer: "domestic",
    kind: "news",
    lon: 118.8,
    lat: 32.1,
    label: "华东 · 区域信息示例",
    detail: "区域精度固定夹具；标记使用华东区域示意中心，只验证 region 精度的阅读方式，不是快讯原文坐标或实时事件。",
    region: "华东",
    precision: "region",
    severity: "low",
    source: "金十数据（参考来源主页）",
    attribution: "景行本地固定夹具；没有对应实时原文，未连接实时上游",
    observedAt: "2026-09-09T04:00:00Z",
    updatedAt: PREVIEW_UPDATED_AT,
    url: "https://www.jin10.com/",
  },
  {
    id: "domestic-unknown",
    layer: "domestic",
    kind: "news",
    lon: null,
    lat: null,
    label: "中国相关 · 未定位快讯聚合",
    detail: "固定示例表示快讯没有可核验的地点字段，因此只保留在列表中，不生成地图坐标。",
    region: "中国相关",
    precision: "unknown",
    severity: "low",
    source: "财联社（参考来源主页）",
    attribution: "景行本地固定夹具；没有对应实时原文；地点未知时不使用关键词或来源所在地推断坐标",
    observedAt: null,
    updatedAt: PREVIEW_UPDATED_AT,
    url: "https://www.cls.cn/telegraph",
  },
];

const lightFixtures: SituationItem[] = [
  [116.4, 39.9, "华北样本网格", "中国", "高", 3],
  [121.5, 31.2, "长三角样本网格", "中国", "高", 3],
  [113.3, 23.1, "粤港澳样本网格", "中国", "高", 3],
  [139.7, 35.7, "日本样本网格", "日本", "高", 3],
  [126.9, 37.5, "韩国样本网格", "韩国", "中", 2],
  [103.8, 1.3, "新加坡样本网格", "新加坡", "中", 2],
  [72.9, 19.1, "印度西岸样本网格", "印度", "中", 2],
  [55.3, 25.2, "海湾样本网格", "阿联酋", "中", 2],
  [-74, 40.7, "美国东北样本网格", "美国", "高", 3],
  [-118.2, 34.1, "美国西岸样本网格", "美国", "高", 3],
  [151.2, -33.9, "澳洲东岸样本网格", "澳大利亚", "中", 2],
].map(([lon, lat, label, region, brightnessBand, demoLevel], index) => ({
  id: `light-${index}`,
  layer: "night-lights" as const,
  kind: "light-raster" as const,
  lon: lon as number,
  lat: lat as number,
  label: `${label}（固定样本）`,
  detail: "低分辨率视觉占位夹具，用来验证图层透明度、选择和详情展示；样本等级无物理单位，不是 VIIRS/Black Marble 实测值。",
  region: region as string,
  precision: "raster" as const,
  severity: "low" as const,
  source: "NASA Black Marble（产品设计参考）",
  attribution: "VNP46A3 仅作产品口径参考；当前样本为景行视觉占位，无对应栅格测量",
  observedAt: null,
  updatedAt: PREVIEW_UPDATED_AT,
  url: "https://blackmarble.gsfc.nasa.gov/",
  demoLevel: demoLevel as 1 | 2 | 3,
  brightnessBand: brightnessBand as "低" | "中" | "高",
}));

// Hand-authored silhouettes keep the preview self-contained. They are not a
// Natural Earth data file and must remain labelled as Jingxing demo geometry.
const landPolygons: Array<Array<[number, number]>> = [
  [[-168, 72], [-140, 70], [-124, 55], [-114, 52], [-105, 48], [-96, 49], [-88, 46], [-80, 43], [-67, 46], [-58, 52], [-62, 60], [-78, 67], [-100, 72], [-130, 76]],
  [[-118, 32], [-108, 30], [-102, 24], [-96, 18], [-89, 15], [-84, 10], [-78, 8], [-81, 18], [-88, 23], [-96, 29], [-105, 34]],
  [[-81, 12], [-69, 8], [-62, -4], [-56, -15], [-52, -28], [-57, -42], [-68, -55], [-75, -49], [-78, -30], [-85, -8]],
  [[-11, 35], [3, 37], [16, 33], [29, 31], [39, 24], [50, 29], [62, 37], [75, 42], [90, 44], [104, 51], [121, 53], [137, 48], [151, 55], [166, 61], [178, 54], [170, 44], [155, 39], [143, 34], [132, 25], [118, 21], [108, 10], [96, 5], [85, 8], [76, 20], [65, 24], [53, 17], [40, 10], [32, 3], [23, 5], [16, 13], [8, 20], [-2, 28]],
  [[-18, 35], [-5, 36], [5, 30], [15, 20], [22, 8], [29, -5], [36, -17], [31, -30], [20, -35], [9, -34], [-1, -25], [-8, -10], [-14, 6]],
  [[112, -11], [127, -13], [143, -18], [153, -28], [150, -39], [136, -37], [122, -30], [113, -22]],
  [[-53, 83], [-31, 83], [-21, 73], [-40, 59], [-56, 65]],
];

function project(lon: number, lat: number, width: number, height: number, zoom: number) {
  const x = ((lon + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  return { x: (x - width / 2) * zoom + width / 2, y: (y - height / 2) * zoom + height / 2 };
}

function polygonPath(points: Array<[number, number]>, width: number, height: number, zoom: number) {
  return points.map(([lon, lat], index) => {
    const point = project(lon, lat, width, height, zoom);
    return `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }).join(" ") + " Z";
}

function markerSize(item: SituationItem) {
  return item.severity === "high" ? 7 : item.severity === "medium" ? 5.5 : 4;
}

function precisionLabel(precision: Precision) {
  return { country: "国家级聚合", region: "区域级聚合", city: "城市级示例", raster: "栅格样本", unknown: "位置未知" }[precision];
}

function formatFixtureTime(value: string | null) {
  if (!value) return "时间未知";
  const date = new Date(value);
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp) || timestamp > Date.now() + 5 * 60_000) return "时间未知";
  return `${formatFull(date)} 北京时间（UTC+8）`;
}

function formatFixtureUtc(value: string | null) {
  if (!value) return "时间未知";
  const date = new Date(value);
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp) || timestamp > Date.now() + 5 * 60_000) return "时间未知";
  return date.toISOString().replace(".000Z", "Z");
}

function clampPercent(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function activateWithKeyboard(event: KeyboardEvent<SVGGElement>, callback: () => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  event.stopPropagation();
  callback();
}

interface GlobalSituationMapProps {
  liveNews: FeedNewsItem[];
  market: MarketSnapshot | null;
}

export function GlobalSituationMap({ liveNews, market }: GlobalSituationMapProps) {
  const [enabledLayers, setEnabledLayers] = useState<Set<LayerId>>(() => new Set(["base", "day-night", "news-events", "domestic"]));
  const [selected, setSelected] = useState<SituationItem | null>(null);
  const [hovered, setHovered] = useState<SituationItem | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === "undefined" || !window.matchMedia("(max-width: 720px)").matches);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [lightOpacity, setLightOpacity] = useState(0.72);
  const dragRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const detailRef = useRef<HTMLElement>(null);
  const mapWidth = 1200;
  const mapHeight = 620;
  // Keep the prototype's domestic layer independent from the live feed. This
  // prevents a changing headline count from being presented as a fixed-time
  // map snapshot; real geocoded input can replace these fixtures later.
  void liveNews;
  const activeItems = useMemo(() => {
    const items: SituationItem[] = [];
    if (enabledLayers.has("news-events")) items.push(...eventFixtures);
    if (enabledLayers.has("domestic")) items.push(...domesticFixtures);
    if (enabledLayers.has("night-lights")) items.push(...lightFixtures);
    return items;
  }, [enabledLayers]);
  const dayNightLongitude = useMemo(() => {
    const clock = new Date(clockMs);
    return (12 - (clock.getUTCHours() + clock.getUTCMinutes() / 60)) * 15;
  }, [clockMs]);
  const groups: LayerGroup[] = ["基础", "公开事件", "中国相关", "历史观测"];
  const latestMarketPoint = market?.points.at(-1) || null;
  const layerTimeMeta = (layer: LayerDefinition) => {
    if (layer.id === "base") return "无上游观测时间";
    if (layer.id === "day-night") return "随 UTC 时钟计算";
    if (layer.id === "news-events") return `样本时间 ${formatFixtureTime(eventFixtures[0]?.observedAt || null)}`;
    if (layer.id === "domestic") return `示例时间 ${formatFixtureTime(domesticFixtures[0]?.updatedAt || null)}`;
    return `产品日期 ${NIGHT_LIGHT_PRODUCT_DATE}`;
  };

  useEffect(() => {
    const timer = window.setInterval(() => setClockMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selected) return;
    detailRef.current?.focus();
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setSelected(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selected]);

  const toggleLayer = (layer: LayerId) => setEnabledLayers((current) => {
    const next = new Set(current);
    if (next.has(layer)) next.delete(layer); else next.add(layer);
    return next;
  });

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    if ((event.target as Element).closest("[data-map-point='true']")) return;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!isDragging) return;
    setOffset({ x: dragRef.current.ox + event.clientX - dragRef.current.x, y: dragRef.current.oy + event.clientY - dragRef.current.y });
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    setIsDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function handleWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    setZoom((value) => Math.max(.8, Math.min(1.8, value + (event.deltaY < 0 ? .08 : -.08))));
  }

  function selectItem(item: SituationItem) {
    setSelected(item);
    setHovered(null);
  }

  const hoveredPoint = hovered && hovered.lon !== null && hovered.lat !== null
    ? project(hovered.lon, hovered.lat, mapWidth, mapHeight, zoom)
    : null;

  return (
    <section className="situation-page" aria-labelledby="situation-title">
      <div className="situation-topline">
        <div className="situation-title-wrap">
          <div className="situation-kicker"><Globe2 size={14} aria-hidden="true" /> JINGXING GLOBAL PULSE</div>
          <h1 id="situation-title">全球态势</h1>
          <p>把公开信息放回地理坐标，快速识别市场、供应链与风险的空间关系。</p>
        </div>
        <div className="situation-preview-status" role="status"><i aria-hidden="true" />固定演示 · 分层时间 <span>各层数据截至/产品日期见图层与详情</span></div>
      </div>

      <div className={`situation-shell ${sidebarOpen ? "is-sidebar-open" : "is-sidebar-closed"}`}>
        <aside className={`situation-sidebar ${sidebarOpen ? "is-open" : "is-closed"}`} aria-label="地图图层控制">
          <div className="situation-sidebar-head">
            <div><Layers3 size={16} aria-hidden="true" /><strong>图层</strong><span>5 个必要层</span></div>
            <button type="button" className="situation-icon-button" onClick={() => setSidebarOpen(false)} aria-label="收起图层控制"><X size={17} aria-hidden="true" /></button>
          </div>
          <div className="situation-layer-list">
            {groups.map((group) => <div className="situation-layer-group" key={group}>
              <span className="situation-group-label">{group}</span>
              {layerDefinitions.filter((layer) => layer.group === group).map((layer) => {
                const Icon = layer.icon;
                const active = enabledLayers.has(layer.id);
                const countLabel = layer.id === "news-events"
                  ? `${eventFixtures.length} 个固定`
                    : layer.id === "domestic"
                    ? `${domesticFixtures.length} 个固定`
                      : layer.id === "night-lights"
                      ? `${lightFixtures.length} 个样本网格`
                      : layer.id === "day-night" ? "计算" : "底图";
                const sourceMeta = `${layer.source} · ${layerTimeMeta(layer)}`;
                const scopeMeta = `${layer.coverage} · ${layer.cadence}`;
                return <div className="situation-layer-entry" key={layer.id}>
                  <button type="button" className={`situation-layer ${active ? "is-active" : ""}`} onClick={() => toggleLayer(layer.id)} aria-pressed={active} aria-label={`${layer.label}，${active ? "已开启" : "已关闭"}，${layerStateLabels[layer.state]}，来源 ${layer.source}，归因 ${layer.attribution}，覆盖 ${layer.coverage}，${layer.productDate ? `产品日期 ${layer.productDate}` : layer.cadence}`} title={`${layer.description}；${layer.attribution}`}>
                    <i style={{ "--layer-color": layer.color } as React.CSSProperties}><Icon size={16} aria-hidden="true" /></i>
                    <span className="situation-layer-copy"><strong>{layer.label}</strong><small>{layerStateLabels[layer.state]} · {countLabel}</small><em>{sourceMeta}</em><em>{scopeMeta}</em></span>
                    <span className="situation-layer-toggle" aria-hidden="true" />
                  </button>
                  {layer.id === "night-lights" && active ? <label className="situation-layer-opacity">
                    <span>视觉占位透明度</span>
                    <output>{Math.round(lightOpacity * 100)}%</output>
                    <input type="range" min="0.2" max="1" step="0.05" value={lightOpacity} onChange={(event) => setLightOpacity(Number(event.target.value))} aria-label="夜间灯光视觉占位透明度" />
                  </label> : null}
                </div>;
              })}
            </div>)}
          </div>
          <div className="situation-source-note">
            <strong>预览边界</strong>
            <span>当前五层均为本地固定夹具或本地计算，不代表实时全球监控。底图是景行手写演示几何，不是 Natural Earth 数据文件。</span>
            <span>夜间灯光是参考 {NIGHT_LIGHT_PRODUCT_DATE} 月度产品口径的视觉占位：无物理单位、无对应栅格测量，不可推导人口、经济或电力。</span>
            <span>所有时刻统一显示北京时间（UTC+8），详情同时保留原始 UTC。</span>
            <span>未接入的航班、船舶、卫星、火点、天气和敏感目标层不会显示为可用数据。</span>
          </div>
        </aside>

        {!sidebarOpen ? <button type="button" className="situation-sidebar-open" onClick={() => setSidebarOpen(true)} aria-label="展开图层控制"><Layers3 size={18} aria-hidden="true" /></button> : null}

        <div className="situation-map-card">
          <div className="situation-map-toolbar">
            <div className="situation-map-mode"><span className="situation-map-mode-button"><Globe2 size={15} aria-hidden="true" /> 2D 地球</span><span>公开信息 · 固定预览</span></div>
            <div className="situation-map-actions">
              <button type="button" onClick={() => setZoom((value) => Math.min(1.8, value + .15))} aria-label="放大地图"><Plus size={18} aria-hidden="true" /></button>
              <button type="button" onClick={() => setZoom((value) => Math.max(.8, value - .15))} aria-label="缩小地图"><Minus size={18} aria-hidden="true" /></button>
              <button type="button" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }} aria-label="重置地图视图"><Maximize2 size={17} aria-hidden="true" /></button>
            </div>
          </div>
          <div className={`situation-map-viewport ${isDragging ? "is-dragging" : ""}`}>
            <svg className="situation-map" viewBox={`0 0 ${mapWidth} ${mapHeight}`} role="img" aria-labelledby="situation-map-title situation-map-description" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onWheel={handleWheel}>
              <title id="situation-map-title">全球态势固定预览地图</title>
              <desc id="situation-map-description">可拖动和缩放的世界地图。地图点位同时提供右侧可访问列表，固定演示数据不代表实时观测。</desc>
              <defs>
                <radialGradient id="situation-glow" cx="50%" cy="47%" r="70%"><stop offset="0" stopColor="var(--situation-map-glow)" /><stop offset=".68" stopColor="var(--situation-map-deep)" /><stop offset="1" stopColor="var(--situation-map-edge)" /></radialGradient>
                <filter id="light-blur"><feGaussianBlur stdDeviation="5" /></filter>
                <filter id="marker-glow"><feGaussianBlur stdDeviation="2.5" /></filter>
              </defs>
              <rect width={mapWidth} height={mapHeight} fill="url(#situation-glow)" />
              <g className="situation-map-grid" transform={`translate(${offset.x} ${offset.y})`} aria-hidden="true">
                {Array.from({ length: 13 }, (_, index) => <path key={`lat-${index}`} d={`M${-mapWidth} ${index * mapHeight / 12} H${mapWidth * 2}`} />)}
                {Array.from({ length: 25 }, (_, index) => <path key={`lon-${index}`} d={`M${index * mapWidth / 24} ${-mapHeight} V${mapHeight * 2}`} />)}
              </g>
              <g transform={`translate(${offset.x} ${offset.y})`}>
                {enabledLayers.has("base") ? landPolygons.map((polygon, index) => <path key={index} className="situation-land" d={polygonPath(polygon, mapWidth, mapHeight, zoom)} />) : null}
                {enabledLayers.has("day-night") ? (() => {
                  const x = project(dayNightLongitude, 0, mapWidth, mapHeight, zoom).x;
                  return <path className="situation-terminator" d={`M${x.toFixed(1)} ${-mapHeight} Q${(x + 130).toFixed(1)} ${(mapHeight * .5).toFixed(1)} ${x.toFixed(1)} ${mapHeight * 2}`} />;
                })() : null}
                {activeItems.map((item) => {
                  if (item.lon === null || item.lat === null) return null;
                  const point = project(item.lon, item.lat, mapWidth, mapHeight, zoom);
                  if (item.kind === "light-raster") {
                    const radius = item.demoLevel === 3 ? 20 : item.demoLevel === 2 ? 15 : 11;
                    return <g key={item.id} className="situation-light" style={{ opacity: lightOpacity }} data-map-point="true" onPointerDown={(event) => event.stopPropagation()} onClick={() => selectItem(item)} onMouseEnter={() => setHovered(item)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(item)} onBlur={() => setHovered(null)} onKeyDown={(event) => activateWithKeyboard(event, () => selectItem(item))} role="button" tabIndex={0} aria-pressed={selected?.id === item.id} aria-label={`${item.label}，视觉占位等级${item.brightnessBand}，无物理单位`}>
                      <circle className="situation-point-hit" cx={point.x} cy={point.y} r={22} />
                      <circle cx={point.x} cy={point.y} r={radius * 1.7} opacity={.2} filter="url(#light-blur)" />
                      <circle cx={point.x} cy={point.y} r={radius} opacity={item.demoLevel === 3 ? .72 : .5} />
                      <circle cx={point.x} cy={point.y} r={2.2} />
                    </g>;
                  }
                  const layer = layerDefinitions.find((entry) => entry.id === item.layer)!;
                  const size = markerSize(item);
                  return <g key={item.id} className={`situation-marker is-${item.severity}`} data-map-point="true" onPointerDown={(event) => event.stopPropagation()} onClick={() => selectItem(item)} onMouseEnter={() => setHovered(item)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(item)} onBlur={() => setHovered(null)} onKeyDown={(event) => activateWithKeyboard(event, () => selectItem(item))} role="button" tabIndex={0} aria-pressed={selected?.id === item.id} aria-label={item.label}>
                    <circle className="situation-point-hit" cx={point.x} cy={point.y} r={22} />
                    <circle className="situation-marker-halo" cx={point.x} cy={point.y} r={size * 2.6} style={{ fill: layer.color }} />
                    <circle cx={point.x} cy={point.y} r={size} style={{ fill: layer.color }} />
                    {item.severity === "high" ? <circle className="situation-marker-pulse" cx={point.x} cy={point.y} r={size * 1.8} style={{ stroke: layer.color }} /> : null}
                  </g>;
                })}
              </g>
              <g className="situation-map-vignette" aria-hidden="true"><rect width={mapWidth} height={mapHeight} /></g>
            </svg>
            {hovered && hoveredPoint ? <div className="situation-map-preview" style={{
              left: `${clampPercent(((hoveredPoint.x + offset.x) / mapWidth) * 100, 7, 79)}%`,
              top: `${clampPercent(((hoveredPoint.y + offset.y) / mapHeight) * 100, 7, 76)}%`,
            }} role="status">
              <strong>{hovered.label}</strong>
              <span>{hovered.region} · {precisionLabel(hovered.precision)} · {hovered.kind === "light-raster" ? "历史产品口径视觉占位" : "固定演示"}</span>
            </div> : null}
            <div className="situation-map-hint">拖动浏览 · 滚轮缩放</div>
            <div className="situation-map-legend" aria-label="地图图例"><span><i className="legend-dot legend-light" />灯光视觉占位</span><span><i className="legend-dot legend-event" />公开事件示例</span><span><i className="legend-dot legend-domestic" />中国相关夹具</span><span className="legend-light-scale"><i />演示等级 低 → 高</span></div>
          </div>
          <div className="situation-timeline"><div><span className="timeline-static" /><strong>PREVIEW</strong><span>分层时间</span></div><div className="timeline-track"><i style={{ left: "72%" }} /><b style={{ left: "72%" }}>灯光参考产品 {NIGHT_LIGHT_PRODUCT_DATE}</b></div><span>夹具版本 {formatFixtureTime(PREVIEW_UPDATED_AT)}</span></div>
        </div>

        <aside ref={detailRef} tabIndex={-1} className={`situation-detail ${selected ? "has-selection" : ""}`} aria-live="polite">
            {selected ? <>
            <div className="situation-detail-head"><span className="situation-detail-eyebrow">SELECTED SIGNAL</span><button type="button" onClick={() => setSelected(null)} aria-label="关闭详情"><X size={17} aria-hidden="true" /></button></div>
            <h2>{selected.label}</h2>
            <p className="situation-detail-region">{selected.region} · {precisionLabel(selected.precision)}</p>
            {selected.kind === "light-raster" ? <div className="situation-light-meter"><div><span>视觉占位样本等级</span><strong>{selected.brightnessBand}</strong></div><small>离散等级只用于验证视觉层级，无物理单位、无对应栅格测量，不是 VIIRS/Black Marble 实测值；参考产品日期 {NIGHT_LIGHT_PRODUCT_DATE}，不可用于推导人口、经济或电力。</small></div> : <p className="situation-detail-copy">{selected.detail}</p>}
            <div className="situation-detail-meta"><span>位置精度</span><strong>{precisionLabel(selected.precision)}</strong></div>
            <div className="situation-detail-meta is-stacked"><span>{selected.kind === "light-raster" ? "产品日期" : "样本时间（北京时间 UTC+8）"}</span><strong>{selected.kind === "light-raster" ? NIGHT_LIGHT_PRODUCT_DATE : formatFixtureTime(selected.observedAt)}</strong>{selected.kind !== "light-raster" && selected.observedAt ? <small>原始 UTC {formatFixtureUtc(selected.observedAt)}</small> : null}</div>
            <div className="situation-detail-meta is-stacked"><span>夹具版本时间（北京时间 UTC+8）</span><strong>{formatFixtureTime(selected.updatedAt)}</strong><small>原始 UTC {formatFixtureUtc(selected.updatedAt)}</small></div>
            <div className="situation-detail-provenance"><span>参考来源</span><strong>{selected.source}</strong><small>{selected.attribution}</small>{selected.url ? <a href={selected.url} target="_blank" rel="noreferrer">查看参考来源 ↗</a> : null}</div>
            <p className="situation-detail-disclaimer">固定演示点和机器聚合仅用于验证交互，不代表实时监控、事实核验或投资建议。</p>
          </> : <>
            <div className="situation-detail-empty"><Globe2 size={30} aria-hidden="true" /><strong>选择一个信号</strong><span>点击或键盘聚焦地图点位，查看来源、时间和位置精度。</span></div>
            <div className="situation-domestic-card"><div><MapPin size={16} aria-hidden="true" /><strong>中国相关夹具</strong><b>{domesticFixtures.length}</b></div><p>包含国家、区域、城市和位置未知四种精度；未知项只在列表中展示。</p><span>仅中国大陆交互样本；港澳台和非财经事件未接入</span></div>
            <div className="situation-market-card"><div><Activity size={16} aria-hidden="true" /><strong>沪深300 · 独立行情</strong><b>{latestMarketPoint?.price?.toFixed(2) || "--"}</b></div><p>{latestMarketPoint ? `${latestMarketPoint.changePercent >= 0 ? "+" : ""}${latestMarketPoint.changePercent.toFixed(2)}% · 来自主站行情输入，不属于地图固定夹具` : "行情等待同步；不属于地图固定夹具"}</p></div>
          </>}
          <div className="situation-accessible-list" aria-label="地图信号列表">
            <div className="situation-accessible-list-head"><strong>可读取信号列表</strong><span>{activeItems.length} 个样本</span></div>
            <div className="situation-accessible-list-items" role="list">
              {activeItems.map((item) => <div role="listitem" key={item.id}><button type="button" className="situation-list-item" onClick={() => selectItem(item)} onMouseEnter={() => setHovered(item)} onMouseLeave={() => setHovered(null)} aria-pressed={selected?.id === item.id}>
                <i className={`situation-list-swatch is-${item.layer}`} aria-hidden="true" />
                <span><strong>{item.label}</strong><small>{item.region} · {precisionLabel(item.precision)}</small></span>
                <b>{item.kind === "light-raster" ? "灯光" : item.kind === "news" ? "国内" : "事件"}</b>
              </button></div>)}
              {!activeItems.length ? <p className="situation-list-empty">请打开一个点位图层。</p> : null}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
