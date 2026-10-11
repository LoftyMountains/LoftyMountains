import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { geoArea, geoDistance, geoGraticule10, geoMercator, geoOrthographic, geoPath } from "d3";
import { LocateFixed, Minus, Plus } from "lucide-react";
import maplibregl from "maplibre-gl/dist/maplibre-gl-csp.js";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import type { FeatureCollection, Geometry, MultiPolygon, Polygon } from "geojson";
import type { EconomicLocation, EconomicNewsItem, EconomicReferencePoint, MapFeature, MapLayerId } from "../../shared/types";
import type { AviationCenter } from "../lib/live-aviation";
import { OVERLAY_LAYERS, POSITION_LABELS, isOverlayShapeVisible, overlayIcon, prepareOverlays } from "../lib/map-overlays";
import { installOverlayLayers, OVERLAY_HIT_LAYERS, updateOverlayLayers } from "../lib/map-overlay-layers";
import "maplibre-gl/dist/maplibre-gl.css";
import "./economy-map.css";
import "./map-overlays.css";

export interface EconomicMapProps {
  items: EconomicNewsItem[];
  referencePoints: EconomicReferencePoint[];
  features: MapFeature[];
  selectedFeatureId: string | null;
  onSelectFeature: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSelectReference: (point: EconomicReferencePoint) => void;
  projection: "globe" | "mercator";
  onViewCenterChange?: (center: AviationCenter) => void;
  focus: { longitude: number; latitude: number; zoom?: number; key: number } | null;
}

interface MentionPoint {
  location: EconomicLocation;
  itemIds: string[];
  important: boolean;
}

const HOME = { longitude: 70, latitude: 20, zoom: 2.1 };
const BASEMAP_URL = `${import.meta.env.BASE_URL}data/countries.geojson`;
const GRATICULE = geoGraticule10();
const KIND_LABELS: Record<EconomicReferencePoint["kind"], string> = {
  "financial-center": "Financial centers",
  port: "Major ports",
  chokepoint: "Trade chokepoints",
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
  return `${point.location.label}: mentioned in ${point.itemIds.length} news records. View the latest news`;
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

export function EconomicMap({ items, referencePoints, features, selectedFeatureId, onSelectFeature, selectedId, onSelect, onSelectReference, projection, focus, onViewCenterChange }: EconomicMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef(new Map<string, Marker>());
  const callbacksRef = useRef({ onSelect, onSelectReference, onSelectFeature, onViewCenterChange });
  callbacksRef.current = { onSelect, onSelectReference, onSelectFeature, onViewCenterChange };
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [basemapError, setBasemapError] = useState(false);
  const [camera, setCamera] = useState(HOME);
  const [dragging, setDragging] = useState(false);
  const [size, setSize] = useState({ width: 1200, height: 700 });
  const [countries, setCountries] = useState<FeatureCollection | null>(null);
  const [hoveredFeature, setHoveredFeature] = useState<{ id: string; x: number; y: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; longitude: number; latitude: number } | null>(null);
  const mentions = useMemo(() => aggregateMentions(items), [items]);
  const overlays = useMemo(() => prepareOverlays(features, selectedFeatureId), [features, selectedFeatureId]);
  const overlayRef = useRef(overlays);
  overlayRef.current = overlays;
  const overlayById = useMemo(() => new Map(overlays.map((overlay) => [overlay.feature.id, overlay])), [overlays]);
  const hoveredOverlay = hoveredFeature ? overlayById.get(hoveredFeature.id) : undefined;
  const mentionRef = useRef(mentions);
  const referenceRef = useRef(referencePoints);
  mentionRef.current = mentions;
  referenceRef.current = referencePoints;

  useEffect(() => {
    if (!dragging) callbacksRef.current.onViewCenterChange?.({ longitude: camera.longitude, latitude: camera.latitude });
  }, [camera.longitude, camera.latitude, projection, dragging]);

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
      map.getCanvas().setAttribute("aria-label", "Global intelligence map. Use arrow keys to pan and plus or minus to zoom. Use the map object selector or news feed to access details.");
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
      map.on("movestart", () => setHoveredFeature(null));
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
    if (ready && !fallback) {
      mapRef.current?.setProjection({ type: projection });
      // A flat map must wrap to centre the Pacific and expose both sides of ±180°.
      mapRef.current?.setRenderWorldCopies(projection === "mercator");
    }
  }, [projection, ready, fallback]);

  useEffect(() => {
    if (!focus) return;
    const next = { longitude: focus.longitude, latitude: focus.latitude, zoom: (focus.zoom ?? 2.5) + viewportHomeZoom(containerRef.current?.clientWidth ?? 1200) - HOME.zoom };
    if (fallback) setCamera(next);
    else if (ready) mapRef.current?.flyTo({ center: [next.longitude, next.latitude], zoom: next.zoom, duration: reducedMotion() ? 0 : 900 });
  }, [focus, fallback, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || fallback) return;
    installOverlayLayers(map);
    updateOverlayLayers(map, overlayRef.current);
    const pick = (point: { x: number; y: number }) => {
      // Prefer a point over the large polygon or route underneath it.
      const hits = map.queryRenderedFeatures([point.x, point.y], { layers: OVERLAY_HIT_LAYERS });
      const pointHit = hits.find((hit) => hit.layer.id === "overlay-icons" || hit.layer.id === "overlay-point-halo");
      const id = (pointHit ?? hits[0])?.properties?.entityId;
      return typeof id === "string" ? id : null;
    };
    const click = (event: { point: { x: number; y: number } }) => {
      const id = pick(event.point);
      if (id) callbacksRef.current.onSelectFeature(id);
    };
    const move = (event: { point: { x: number; y: number } }) => {
      const id = pick(event.point);
      map.getCanvas().style.cursor = id ? "pointer" : "";
      setHoveredFeature((current) => current?.id === id ? current : id ? { id, x: event.point.x, y: event.point.y } : null);
    };
    const leave = () => setHoveredFeature(null);
    map.on("click", click);
    map.on("mousemove", move);
    map.getCanvas().addEventListener("mouseleave", leave);
    return () => {
      if (mapRef.current !== map) return;
      map.off("click", click);
      map.off("mousemove", move);
      map.getCanvas().removeEventListener("mouseleave", leave);
      // React StrictMode can re-run effects against the same loaded map.
      for (const id of ["overlay-icons", "overlay-point-halo", "overlay-line-hit", "overlay-line-reference", "overlay-line-solid", "overlay-line-glow", "overlay-area"]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      for (const id of ["overlay-points", "overlay-shapes"]) if (map.getSource(id)) map.removeSource(id);
    };
  }, [ready, fallback]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && ready && !fallback) updateOverlayLayers(map, overlays);
  }, [overlays, ready, fallback]);

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
      button.setAttribute("aria-label", `${point.name} · ${KIND_LABELS[point.kind]} · Static reference point`);
      button.setAttribute("title", `${point.name} · ${KIND_LABELS[point.kind]} (Static reference)`);
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
      .rotate([-camera.longitude, 0]).center([0, camera.latitude]).clipExtent([[0, 0], [width, height]]);
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
      <svg className="economic-fallback-globe" viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label="Economic geography map in 2D compatibility mode. Use the zoom buttons and drag to pan."
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
          dragRef.current = { x: event.clientX, y: event.clientY, longitude: camera.longitude, latitude: camera.latitude };
        }}
        onPointerMove={moveFallback}
        onPointerUp={() => { dragRef.current = null; setDragging(false); }}
        onPointerCancel={() => { dragRef.current = null; setDragging(false); }}>
        <path className="economic-fallback-ocean" d={fallbackPath({ type: "Sphere" }) ?? ""} />
        <path className="economic-fallback-grid" d={fallbackPath(GRATICULE) ?? ""} />
        {countries?.features.map((feature, index) => <path className="economic-fallback-country" key={index} d={fallbackPath(feature) ?? ""} />)}
        {[...overlays].sort((a, b) => Number(a.properties.selected) - Number(b.properties.selected)).map((overlay) => {
          if (!isOverlayShapeVisible(overlay)) return null;
          const polygon = overlay.geometry.type === "Polygon" || overlay.geometry.type === "MultiPolygon";
          const path = fallbackPath(sphericalGeometry(overlay.geometry));
          if (!path) return null;
          return <g key={`shape:${overlay.feature.id}`} className={`map-overlay-shape${overlay.properties.selected ? " is-selected" : ""}`} style={{ color: overlay.properties.color }}
            onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onSelectFeature(overlay.feature.id); }}>
            <title>{overlay.feature.properties.name} · {POSITION_LABELS[overlay.feature.properties.positionKind]}</title>
            <path d={path} className={polygon ? "map-overlay-area" : "map-overlay-line"} strokeDasharray={overlay.properties.dashed ? "6 4" : undefined} />
            {!polygon && <path d={path} className="map-overlay-line-target" />}
          </g>;
        })}
        {[...overlays].sort((a, b) => Number(a.properties.selected) - Number(b.properties.selected)).map((overlay) => {
          const position = project(...overlay.feature.properties.anchor);
          if (!position) return null;
          return <g key={`anchor:${overlay.feature.id}`} className={`map-overlay-anchor${overlay.properties.selected ? " is-selected" : ""}${overlay.properties.approximate ? " is-region" : ""}`}
            transform={`translate(${position[0]},${position[1]})`} style={{ color: overlay.properties.color }}
            onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onSelectFeature(overlay.feature.id); }}>
            <title>{overlay.feature.properties.name} · {POSITION_LABELS[overlay.feature.properties.positionKind]}</title>
            {overlay.properties.selected && <circle className="map-overlay-anchor-halo" r={23} />}
            <circle className="map-overlay-anchor-disc" r={14} />
            <path className="map-overlay-anchor-icon" d={overlayIcon(overlay.feature).path}
              transform={`rotate(${overlay.properties.heading}) translate(-9,-9) scale(.75)`} />
          </g>;
        })}
      </svg>
      {referencePoints.map((point) => {
        const position = project(point.longitude, point.latitude);
        return position && <button type="button" key={point.id} className={`economic-reference-marker economic-fallback-marker is-${point.kind}`} style={{ left: position[0], top: position[1] }}
          aria-label={`${point.name} · ${KIND_LABELS[point.kind]} · Static reference point`} title={`${point.name} · Static reference`} onClick={() => onSelectReference(point)}>
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
    {hoveredOverlay && hoveredFeature && !fallback && <div className="map-overlay-tooltip" role="tooltip"
      style={{ left: Math.max(12, Math.min(size.width - 264, hoveredFeature.x + 20)), top: Math.max(12, Math.min(size.height - 76, hoveredFeature.y + 18)), borderColor: hoveredOverlay.properties.color }}>
      <strong>{hoveredOverlay.feature.properties.name}</strong>
      <span>{OVERLAY_LAYERS[hoveredOverlay.feature.properties.layer].label} · {POSITION_LABELS[hoveredOverlay.feature.properties.positionKind]}</span>
    </div>}
    {overlays.length > 0 && <label className="map-overlay-selector">
      <span>Map objects <b>{overlays.length}</b></span>
      <select aria-label="Select a map object to view details" value={selectedFeatureId && overlayById.has(selectedFeatureId) ? selectedFeatureId : ""} onChange={(event) => { if (event.target.value) onSelectFeature(event.target.value); }}>
        <option value="" disabled>Select a map object</option>
        {(Object.keys(OVERLAY_LAYERS) as MapLayerId[]).map((layer) => {
          const layerItems = overlays.filter((overlay) => overlay.feature.properties.layer === layer);
          return layerItems.length > 0 && <optgroup key={layer} label={OVERLAY_LAYERS[layer].label}>{layerItems.map(({ feature }) => <option key={feature.id} value={feature.id}>{feature.properties.name} · {POSITION_LABELS[feature.properties.positionKind]}</option>)}</optgroup>;
        })}
      </select>
    </label>}
    {!ready && !fallback && <div className="economic-map-message" role="status"><span className="economic-map-loading" />Loading the global view</div>}
    {basemapError && <div className="economic-map-message is-error" role="status">The base map is unavailable. You can continue browsing the news feed.</div>}
    <div className="economic-map-controls" aria-label="Map controls">
      <button type="button" onClick={() => zoomBy(0.7)} aria-label="Zoom in" title="Zoom in"><Plus size={17} /></button>
      <button type="button" onClick={() => zoomBy(-0.7)} aria-label="Zoom out" title="Zoom out"><Minus size={17} /></button>
      <span />
      <button type="button" onClick={resetView} aria-label="Reset global view" title="Reset global view"><LocateFixed size={17} /></button>
    </div>
    <div className="economic-map-coordinate" aria-hidden="true">{Math.abs(camera.latitude).toFixed(1)}° {camera.latitude >= 0 ? "N" : "S"}<span />{Math.abs(camera.longitude).toFixed(1)}° {camera.longitude >= 0 ? "E" : "W"}</div>
    <div className="economic-map-attribution">
      {fallback && <span>Compatibility mode · </span>}<a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Natural Earth</a><span> · {features.length ? "See details for position and route types" : "Place mentions ≠ event locations"}</span>
    </div>
  </div>;
}
