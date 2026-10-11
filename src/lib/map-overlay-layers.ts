import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { OVERLAY_LAYERS, WEATHER_ICONS, overlayCollections, type PreparedOverlay } from "./map-overlays";

export const OVERLAY_HIT_LAYERS = ["overlay-icons", "overlay-point-halo", "overlay-line-hit", "overlay-area"];
const POINTS_SOURCE = "overlay-points";
const SHAPES_SOURCE = "overlay-shapes";
const SELECTED: ExpressionSpecification = ["boolean", ["get", "selected"], false];

/** Icons are generated locally: this map needs no external sprites, fonts or imagery. */
function iconImage(color: string, path: string, approximate: boolean): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = 72;
  canvas.height = 72;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.scale(2, 2);
  context.beginPath();
  context.arc(18, 18, 15, 0, Math.PI * 2);
  context.fillStyle = "rgba(7,15,25,.92)";
  context.fill();
  context.strokeStyle = color;
  context.lineWidth = 1;
  if (approximate) context.setLineDash([2, 2]);
  context.stroke();
  context.setLineDash([]);
  context.translate(8, 8);
  context.scale(20 / 24, 20 / 24);
  context.strokeStyle = color;
  context.lineWidth = 1.7;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke(new Path2D(path));
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

export function installOverlayLayers(map: MapLibreMap) {
  const icons = [...Object.entries(OVERLAY_LAYERS), ...Object.entries(WEATHER_ICONS).map(([key, icon]) => [`weather-${key}`, { color: OVERLAY_LAYERS.weather.color, icon }] as const)];
  for (const [layer, metadata] of icons) {
    for (const approximate of [false, true]) {
      const id = `overlay-${layer}${approximate ? "-region" : ""}`;
      const image = iconImage(metadata.color, metadata.icon, approximate);
      if (image && !map.hasImage(id)) map.addImage(id, image, { pixelRatio: 2 });
    }
  }
  const collections = overlayCollections([]);
  map.addSource(SHAPES_SOURCE, { type: "geojson", data: collections.shapes, tolerance: 0.1 });
  map.addSource(POINTS_SOURCE, { type: "geojson", data: collections.points });
  map.addLayer({
    id: "overlay-area", type: "fill", source: SHAPES_SOURCE,
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "fill-color": ["get", "color"], "fill-opacity": ["case", SELECTED, 0.24, 0.1] },
  });
  map.addLayer({
    id: "overlay-line-glow", type: "line", source: SHAPES_SOURCE,
    paint: { "line-color": ["get", "color"], "line-width": ["case", SELECTED, 9, 5], "line-opacity": ["case", SELECTED, 0.2, 0.07] },
  });
  map.addLayer({
    id: "overlay-line-solid", type: "line", source: SHAPES_SOURCE,
    filter: ["!", ["boolean", ["get", "dashed"], false]],
    paint: { "line-color": ["get", "color"], "line-width": ["case", SELECTED, 2.4, 1.3], "line-opacity": ["case", SELECTED, 1, 0.7] },
  });
  map.addLayer({
    id: "overlay-line-reference", type: "line", source: SHAPES_SOURCE,
    filter: ["boolean", ["get", "dashed"], false],
    paint: { "line-color": ["get", "color"], "line-width": ["case", SELECTED, 2.5, 1.5], "line-opacity": ["case", SELECTED, 1, 0.64], "line-dasharray": [3, 2] },
  });
  // The wider invisible line makes narrow routes usable with touch and a mouse.
  map.addLayer({ id: "overlay-line-hit", type: "line", source: SHAPES_SOURCE,
    paint: { "line-color": ["get", "color"], "line-width": 14, "line-opacity": 0 } });
  map.addLayer({
    id: "overlay-point-halo", type: "circle", source: POINTS_SOURCE,
    paint: { "circle-radius": ["case", SELECTED, 24, 17], "circle-color": ["get", "color"],
      "circle-opacity": ["case", SELECTED, 0.17, 0.025], "circle-stroke-color": ["get", "color"],
      "circle-stroke-width": ["case", SELECTED, 1.5, 0], "circle-stroke-opacity": 0.8 },
  });
  map.addLayer({
    id: "overlay-icons", type: "symbol", source: POINTS_SOURCE,
    layout: { "icon-image": ["get", "icon"], "icon-size": ["case", SELECTED, 1.18, 0.9],
      "icon-allow-overlap": true, "icon-ignore-placement": true,
      "icon-rotate": ["get", "heading"], "icon-rotation-alignment": "map",
      "symbol-sort-key": ["case", SELECTED, 1, 0] },
  });
}

export function updateOverlayLayers(map: MapLibreMap, overlays: PreparedOverlay[]) {
  const collections = overlayCollections(overlays);
  (map.getSource(POINTS_SOURCE) as GeoJSONSource | undefined)?.setData(collections.points);
  (map.getSource(SHAPES_SOURCE) as GeoJSONSource | undefined)?.setData(collections.shapes);
}
