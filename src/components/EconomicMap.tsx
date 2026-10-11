import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { geoArea, geoDistance, geoGraticule10, geoMercator, geoOrthographic, geoPath } from "d3";
import { LocateFixed, Minus, Plus } from "lucide-react";
import maplibregl from "maplibre-gl/dist/maplibre-gl-csp.js";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import type { FeatureCollection, Geometry, MultiPolygon, Polygon } from "geojson";
import type { EconomicLocation, EconomicNewsItem, EconomicReferencePoint } from "../../shared/types";
import "maplibre-gl/dist/maplibre-gl.css";
import "./economy-map.css";

export interface EconomicMapProps {
  items: EconomicNewsItem[];
  referencePoints: EconomicReferencePoint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSelectReference: (point: EconomicReferencePoint) => void;
  projection: "globe" | "mercator";
  focus: { longitude: number; latitude: number; zoom?: number; key: number } | null;
}

interface MentionPoint {
  location: EconomicLocation;
  itemIds: string[];
  important: boolean;
}

const HOME = { longitude: 70, latitude: 23, zoom: 2.1 };
const BASEMAP_URL = `${import.meta.env.BASE_URL}data/countries.geojson`;
const GRATICULE = geoGraticule10();
const KIND_LABELS: Record<EconomicReferencePoint["kind"], string> = {
  "financial-center": "金融中心",
  port: "主要港口",
  chokepoint: "贸易咽喉",
};

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function viewportHomeZoom(width: number) {
  return HOME.zoom + Math.log2(Math.min(1, Math.max(280, width - 40) / 610));
}

function aggregateMentions(items: EconomicNewsItem[]): MentionPoint[] {
  const mentions = new Map<string, MentionPoint>();
  for (const item of [...items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))) {
    for (const location of item.locations) {
      if (!Number.isFinite(location.longitude) || !Number.isFinite(location.latitude)) continue;
      const current = mentions.get(location.id);
      if (current) {
        if (!current.itemIds.includes(item.id)) current.itemIds.push(item.id);
        current.important ||= item.important;
      } else {
        mentions.set(location.id, { location, itemIds: [item.id], important: item.important });
      }
    }
  }
  return [...mentions.values()].sort((a, b) => a.itemIds.length - b.itemIds.length);
}

function mentionLabel(point: MentionPoint) {
  return `${point.location.label}，${point.itemIds.length} 条快讯提及。查看最新快讯`;
}

/** D3 uses spherical clockwise exterior rings; RFC 7946 basemaps may use the opposite. */
function sphericalGeometry(geometry: Geometry): Geometry {
  const orient = (coordinates: Polygon["coordinates"]) => {
    const polygon: Polygon = { type: "Polygon", coordinates };
    return geoArea(polygon) > Math.PI * 2 ? coordinates.map((ring) => [...ring].reverse()) : coordinates;
  };
  if (geometry.type === "Polygon") return { ...geometry, coordinates: orient(geometry.coordinates) };
  if (geometry.type === "MultiPolygon") {
    return { ...geometry, coordinates: geometry.coordinates.map(orient) } as MultiPolygon;
  }
  return geometry;
}

export function EconomicMap({ items, referencePoints, selectedId, onSelect, onSelectReference, projection, focus }: EconomicMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef(new Map<string, Marker>());
  const callbacksRef = useRef({ onSelect, onSelectReference });
  callbacksRef.current = { onSelect, onSelectReference };
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [basemapError, setBasemapError] = useState(false);
  const [camera, setCamera] = useState(HOME);
  const [size, setSize] = useState({ width: 1200, height: 700 });
  const [countries, setCountries] = useState<FeatureCollection | null>(null);
  const dragRef = useRef<{ x: number; y: number; longitude: number; latitude: number } | null>(null);
  const mentions = useMemo(() => aggregateMentions(items), [items]);
  const mentionRef = useRef(mentions);
  const referenceRef = useRef(referencePoints);
  mentionRef.current = mentions;
  referenceRef.current = referencePoints;

  // Geometry is served by this application; the map never requests tiles, keys, or font services.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let map: MapLibreMap | null = null;
    let loadDeadline: number | undefined;
    const resizeObserver = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      mapRef.current?.resize();
    });
    resizeObserver.observe(container);
    try {
      const initialZoom = viewportHomeZoom(container.clientWidth);
      setCamera({ ...HOME, zoom: initialZoom });
      maplibregl.setWorkerUrl(`${import.meta.env.BASE_URL}vendor/maplibre/maplibre-gl-csp-worker.js`);
      map = new maplibregl.Map({
        container,
        center: [HOME.longitude, HOME.latitude],
        zoom: initialZoom,
        minZoom: 0.5,
        maxZoom: 6,
        attributionControl: false,
        renderWorldCopies: false,
        pitchWithRotate: false,
        dragRotate: false,
        touchPitch: false,
        maxPitch: 0,
        fadeDuration: reducedMotion() ? 0 : 220,
        style: {
          version: 8,
          projection: { type: "globe" },
          sources: {
            countries: { type: "geojson", data: BASEMAP_URL },
            graticule: { type: "geojson", data: GRATICULE },
          },
          layers: [
            { id: "ocean", type: "background", paint: { "background-color": "#09121a" } },
            { id: "graticule", type: "line", source: "graticule", paint: { "line-color": "#38505b", "line-width": 0.6, "line-opacity": 0.33 } },
            { id: "land", type: "fill", source: "countries", paint: { "fill-color": "#14212a", "fill-opacity": 1 } },
            { id: "borders", type: "line", source: "countries", paint: { "line-color": "#354a53", "line-width": 0.7, "line-opacity": 0.65 } },
          ],
        },
      });
      mapRef.current = map;
      map.touchZoomRotate.disableRotation();
      map.getCanvas().setAttribute("aria-label", "全球经济地图。方向键平移，加减键缩放；也可通过快讯列表查看全部信息。");
      loadDeadline = window.setTimeout(() => { if (!disposed) setFallback(true); }, 15_000);
      map.on("load", () => {
        window.clearTimeout(loadDeadline);
        if (!disposed) setReady(true);
      });
      map.on("moveend", () => {
        if (!map || disposed) return;
        const center = map.getCenter();
        setCamera({ longitude: center.lng, latitude: center.lat, zoom: map.getZoom() });
      });
      map.on("error", (event) => {
        if (disposed) return;
        console.warn("Economic map:", event.error?.message);
        if ("sourceId" in event && ["countries", "graticule"].includes(String(event.sourceId))) setFallback(true);
        // Shader / WebGL failures cannot leave the user staring at an empty canvas.
        if (/webgl|shader|context lost|context creation/i.test(event.error?.message ?? "")) setFallback(true);
      });
      map.getCanvas().addEventListener("webglcontextlost", () => { if (!disposed) setFallback(true); });
    } catch {
      container.replaceChildren();
      setFallback(true);
    }
    return () => {
      disposed = true;
      window.clearTimeout(loadDeadline);
      resizeObserver.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
      if (map && mapRef.current === map) map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!fallback) return;
    const controller = new AbortController();
    setReady(false);
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();
    mapRef.current?.remove();
    mapRef.current = null;
    fetch(BASEMAP_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Basemap unavailable");
        return response.json() as Promise<FeatureCollection>;
      })
      .then((data) => {
        setCountries({ ...data, features: data.features.map((feature) => ({ ...feature, geometry: sphericalGeometry(feature.geometry) })) });
        setBasemapError(false);
      })
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setBasemapError(true); });
    return () => controller.abort();
  }, [fallback]);

  useEffect(() => {
    if (ready && !fallback) mapRef.current?.setProjection({ type: projection });
  }, [projection, ready, fallback]);

  useEffect(() => {
    if (!focus) return;
    const next = { longitude: focus.longitude, latitude: focus.latitude, zoom: (focus.zoom ?? 2.5) + viewportHomeZoom(containerRef.current?.clientWidth ?? 1200) - HOME.zoom };
    if (fallback) setCamera(next);
    else if (ready) mapRef.current?.flyTo({ center: [next.longitude, next.latitude], zoom: next.zoom, duration: reducedMotion() ? 0 : 900 });
  }, [focus, fallback, ready]);

  // Reconcile marker elements in place: feed updates never recreate the map or move its camera.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || fallback) return;
    const wanted = new Set<string>();
    for (const point of referencePoints) {
      const key = `reference:${point.id}`;
      wanted.add(key);
      let marker = markersRef.current.get(key);
      if (!marker) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `economic-reference-marker is-${point.kind}`;
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const current = referenceRef.current.find((candidate) => candidate.id === point.id);
          if (current) callbacksRef.current.onSelectReference(current);
        });
        const symbol = document.createElement("span");
        symbol.className = "economic-reference-symbol";
        symbol.setAttribute("aria-hidden", "true");
        const label = document.createElement("span");
        label.className = "economic-reference-name";
        button.append(symbol, label);
        marker = new maplibregl.Marker({ element: button, anchor: "center", subpixelPositioning: true, opacityWhenCovered: "0" }).setLngLat([point.longitude, point.latitude]).addTo(map);
        markersRef.current.set(key, marker);
      }
      marker.setLngLat([point.longitude, point.latitude]);
      const button = marker.getElement();
      button.setAttribute("aria-label", `${point.name} · ${KIND_LABELS[point.kind]} · 静态参考点`);
      button.setAttribute("title", `${point.name} · ${KIND_LABELS[point.kind]}（静态参考）`);
      button.querySelector(".economic-reference-name")!.textContent = point.name;
    }
    for (const point of mentions) {
      const key = `mention:${point.location.id}`;
      wanted.add(key);
      let marker = markersRef.current.get(key);
      if (!marker) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "economic-mention-marker";
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const current = mentionRef.current.find((candidate) => candidate.location.id === point.location.id);
          if (current?.itemIds[0]) callbacksRef.current.onSelect(current.itemIds[0]);
        });
        const count = document.createElement("span");
        count.className = "economic-mention-count";
        const label = document.createElement("span");
        label.className = "economic-mention-name";
        button.append(count, label);
        marker = new maplibregl.Marker({ element: button, anchor: "center", subpixelPositioning: true, opacityWhenCovered: "0" }).setLngLat([point.location.longitude, point.location.latitude]).addTo(map);
        markersRef.current.set(key, marker);
      }
      marker.setLngLat([point.location.longitude, point.location.latitude]);
      const button = marker.getElement();
      const selected = selectedId !== null && point.itemIds.includes(selectedId);
      button.classList.toggle("is-selected", selected);
      button.classList.toggle("is-important", point.important);
      button.setAttribute("aria-label", mentionLabel(point));
      button.setAttribute("aria-pressed", String(selected));
      button.setAttribute("title", mentionLabel(point));
      button.querySelector(".economic-mention-count")!.textContent = String(point.itemIds.length);
      button.querySelector(".economic-mention-name")!.textContent = point.location.label;
    }
    for (const [key, marker] of markersRef.current) {
      if (!wanted.has(key)) { marker.remove(); markersRef.current.delete(key); }
    }
  }, [mentions, referencePoints, selectedId, ready, fallback]);

  const fallbackProjection = useMemo(() => {
    const width = Math.max(1, size.width);
    const height = Math.max(1, size.height);
    const zoomFactor = 2 ** (camera.zoom - viewportHomeZoom(width));
    if (projection === "globe") {
      return geoOrthographic().translate([width / 2, height / 2]).scale(Math.min(width * 0.44, height * 0.43) * zoomFactor)
        .rotate([-camera.longitude, -camera.latitude]).clipAngle(90);
    }
    return geoMercator().translate([width / 2, height / 2]).scale(Math.min(width / 6.4, height / 4) * zoomFactor)
      .center([camera.longitude, camera.latitude]).clipExtent([[0, 0], [width, height]]);
  }, [camera, projection, size]);
  const fallbackPath = useMemo(() => geoPath(fallbackProjection), [fallbackProjection]);
  function project(longitude: number, latitude: number) {
    if (projection === "globe" && geoDistance([longitude, latitude], [camera.longitude, camera.latitude]) > Math.PI / 2) return null;
    const point = fallbackProjection([longitude, latitude]);
    if (!point || point[0] < 0 || point[0] > size.width || point[1] < 0 || point[1] > size.height) return null;
    return point;
  }
  function zoomBy(delta: number) {
    if (fallback) setCamera((previous) => ({ ...previous, zoom: Math.min(6, Math.max(0.5, previous.zoom + delta)) }));
    else mapRef.current?.zoomTo(Math.min(6, Math.max(0.5, (mapRef.current?.getZoom() ?? HOME.zoom) + delta)), { duration: reducedMotion() ? 0 : 220 });
  }
  function resetView() {
    const zoom = viewportHomeZoom(containerRef.current?.clientWidth ?? 1200);
    if (fallback) setCamera({ ...HOME, zoom });
    else mapRef.current?.flyTo({ center: [HOME.longitude, HOME.latitude], zoom, bearing: 0, duration: reducedMotion() ? 0 : 850 });
  }
  function moveFallback(event: PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const scale = 90 / fallbackProjection.scale();
    const longitude = ((drag.longitude - (event.clientX - drag.x) * scale + 540) % 360) - 180;
    const latitude = Math.max(-75, Math.min(75, drag.latitude + (event.clientY - drag.y) * scale));
    setCamera((previous) => ({
      ...previous,
      longitude,
      latitude,
    }));
  }

  return <div className={`economic-map${fallback ? " is-fallback" : ""}`} data-projection={projection}>
    <div ref={containerRef} className="economic-map-canvas" />
    {fallback && <div className="economic-map-fallback">
      <svg className="economic-fallback-globe" viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label="经济地理地图，二维兼容模式。使用缩放按钮，拖动地图平移。"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { x: event.clientX, y: event.clientY, longitude: camera.longitude, latitude: camera.latitude };
        }}
        onPointerMove={moveFallback}
        onPointerUp={() => { dragRef.current = null; }}
        onPointerCancel={() => { dragRef.current = null; }}>
        <path className="economic-fallback-ocean" d={fallbackPath({ type: "Sphere" }) ?? ""} />
        <path className="economic-fallback-grid" d={fallbackPath(GRATICULE) ?? ""} />
        {countries?.features.map((feature, index) => <path className="economic-fallback-country" key={index} d={fallbackPath(feature) ?? ""} />)}
      </svg>
      {referencePoints.map((point) => {
        const position = project(point.longitude, point.latitude);
        return position && <button type="button" key={point.id} className={`economic-reference-marker economic-fallback-marker is-${point.kind}`} style={{ left: position[0], top: position[1] }}
          aria-label={`${point.name} · ${KIND_LABELS[point.kind]} · 静态参考点`} title={`${point.name} · 静态参考`} onClick={() => onSelectReference(point)}>
          <span className="economic-reference-symbol" aria-hidden="true" /><span className="economic-reference-name">{point.name}</span>
        </button>;
      })}
      {mentions.map((point) => {
        const position = project(point.location.longitude, point.location.latitude);
        const selected = selectedId !== null && point.itemIds.includes(selectedId);
        return position && <button type="button" key={point.location.id} className={`economic-mention-marker economic-fallback-marker${selected ? " is-selected" : ""}${point.important ? " is-important" : ""}`}
          style={{ left: position[0], top: position[1] }} aria-label={mentionLabel(point)} title={mentionLabel(point)} aria-pressed={selected} onClick={() => onSelect(point.itemIds[0])}>
          <span className="economic-mention-count">{point.itemIds.length}</span><span className="economic-mention-name">{point.location.label}</span>
        </button>;
      })}
    </div>}
    <div className="economic-map-vignette" aria-hidden="true" />
    {!ready && !fallback && <div className="economic-map-message" role="status"><span className="economic-map-loading" />正在展开全球视野</div>}
    {basemapError && <div className="economic-map-message is-error" role="status">底图暂不可用，可继续通过快讯列表浏览</div>}
    <div className="economic-map-controls" aria-label="地图控制">
      <button type="button" onClick={() => zoomBy(0.7)} aria-label="放大地图" title="放大地图"><Plus size={17} /></button>
      <button type="button" onClick={() => zoomBy(-0.7)} aria-label="缩小地图" title="缩小地图"><Minus size={17} /></button>
      <span />
      <button type="button" onClick={resetView} aria-label="恢复全球视角" title="恢复全球视角"><LocateFixed size={17} /></button>
    </div>
    <div className="economic-map-coordinate" aria-hidden="true">{Math.abs(camera.latitude).toFixed(1)}° {camera.latitude >= 0 ? "N" : "S"}<span />{Math.abs(camera.longitude).toFixed(1)}° {camera.longitude >= 0 ? "E" : "W"}</div>
    <div className="economic-map-attribution">
      {fallback && <span>兼容模式 · </span>}<a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Natural Earth</a><span> · 地点提及 ≠ 事件定位</span>
    </div>
  </div>;
}
