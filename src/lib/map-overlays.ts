import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import type { MapCoordinate, MapFeature, MapGeometry, MapLayerId } from "../../shared/types";

export const OVERLAY_LAYERS: Record<MapLayerId, { label: string; color: string; icon: string }> = {
  weather: { label: "Weather", color: "#75d6ec", icon: "M6 16a4 4 0 0 1-1-7.9 6 6 0 0 1 11.3-1.6A4.8 4.8 0 0 1 18 16 M12 13l-3 5h4l-2 4" },
  aviation: { label: "Aviation", color: "#89baf4", icon: "M12 2l2 7 7 4v2l-7-2v5l3 2v2l-5-2-5 2v-2l3-2v-5l-7 2v-2l7-4z" },
  maritime: { label: "Shipping", color: "#7acbb0", icon: "M8 10V5h8v5M12 2v3M3 12l9-3 9 3-4 7H7zM2 22l3-2 4 2 3-2 3 2 4-2 3 2" },
  satellites: { label: "Satellites", color: "#c5a1f5", icon: "M9 7l8 8-4 4-8-8zM12 4l4-4 8 8-4 4zM0 16l4-4 8 8-4 4zM16 16l4 4M19 14a5 5 0 0 1 3 3" },
  health: { label: "Public health", color: "#eea1b8", icon: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" },
};

export const WEATHER_ICONS: Record<string, string> = {
  fire: "M12 2c2 6-3 7-1 11 2-1 3-3 3-5 6 5 7 10 3 13-3 3-10 2-12-2C2 13 7 9 12 2z",
  water: "M12 2c-2 4-7 8-7 12a7 7 0 0 0 14 0c0-4-5-8-7-12zM8 15a4 4 0 0 0 4 4",
  cyclone: "M20 5A9 9 0 0 0 5 12a7 7 0 0 0 12 5M4 19a9 9 0 0 0 15-7A7 7 0 0 0 7 7M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0",
  volcano: "M2 22l7-13 3 3 3-3 7 13zM8 3l2 3M12 1v5M17 3l-2 3M8 12l3 6 4-3 3 7",
  temperature: "M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0M12 8v10M19 5h3M19 10h2",
  ice: "M12 2v20M3 7l18 10M3 17L21 7M8 4l4 4 4-4M8 20l4-4 4 4M3 11l5-2-1-5M21 13l-5 2 1 5M3 13l5 2-1 5M21 11l-5-2 1-5",
};

export function overlayIcon(feature: MapFeature): { key: string; path: string } {
  const { layer, eventType } = feature.properties;
  if (layer === "weather") {
    const kind = /野火|火灾|wildfire|fire/i.test(eventType) ? "fire"
      : /洪水|水色|flood|water/i.test(eventType) ? "water"
      : /气旋|cyclone|hurricane/i.test(eventType) ? "cyclone"
      : /火山|volcano/i.test(eventType) ? "volcano"
      : /干旱|温度|drought|temperature/i.test(eventType) ? "temperature"
      : /雪|冰|snow|ice/i.test(eventType) ? "ice" : null;
    if (kind) return { key: `weather-${kind}`, path: WEATHER_ICONS[kind] };
  }
  return { key: layer, path: OVERLAY_LAYERS[layer].icon };
}

export const POSITION_LABELS: Record<MapFeature["properties"]["positionKind"], string> = {
  "source-reported": "Source-reported position",
  "reference-route": "Static reference route",
  predicted: "Predicted ground position",
  "approximate-region": "Approximate regional position",
};

export interface OverlayProperties {
  entityId: string;
  layer: MapLayerId;
  color: string;
  icon: string;
  selected: boolean;
  approximate: boolean;
  dashed: boolean;
  heading: number;
}
export interface PreparedOverlay {
  feature: MapFeature;
  geometry: Geometry;
  properties: OverlayProperties;
}

function validCoordinate(point: Position): boolean {
  return point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;
}

/** RFC 7946 seam cuts prevent long artificial lines through the centre of a flat map. */
export function splitAntimeridianLine(points: MapCoordinate[]): MapCoordinate[][] {
  if (points.length < 2 || !points.every(validCoordinate)) return [];
  const lines: MapCoordinate[][] = [];
  let line: MapCoordinate[] = [[...points[0]]];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    let longitude = current[0];
    while (longitude - previous[0] > 180) longitude -= 360;
    while (longitude - previous[0] < -180) longitude += 360;
    if (Math.abs(current[0] - previous[0]) > 180) {
      const boundary = previous[0] >= 0 ? 180 : -180;
      const fraction = longitude === previous[0] ? 0 : (boundary - previous[0]) / (longitude - previous[0]);
      const latitude = previous[1] + fraction * (current[1] - previous[1]);
      line.push([boundary, latitude]);
      if (line.length >= 2) lines.push(line);
      line = [[-boundary, latitude], [...current]];
    } else {
      line.push([...current]);
    }
  }
  if (line.length >= 2) lines.push(line);
  return lines.filter((segment) => segment.some((point) => point[0] !== segment[0][0] || point[1] !== segment[0][1]));
}

function unwrapRing(ring: MapCoordinate[]): MapCoordinate[] {
  const result: MapCoordinate[] = [];
  for (const coordinate of ring) {
    let longitude = coordinate[0];
    const previous = result.at(-1)?.[0];
    if (previous !== undefined) {
      while (longitude - previous > 180) longitude -= 360;
      while (longitude - previous < -180) longitude += 360;
    }
    result.push([longitude, coordinate[1]]);
  }
  return result;
}

function clipRing(ring: MapCoordinate[], boundary: number, keepGreater: boolean): MapCoordinate[] {
  const output: MapCoordinate[] = [];
  const inside = (point: MapCoordinate) => keepGreater ? point[0] >= boundary : point[0] <= boundary;
  let previous = ring.at(-1)!;
  for (const current of ring) {
    if (inside(current) !== inside(previous)) {
      const fraction = (boundary - previous[0]) / (current[0] - previous[0]);
      output.push([boundary, previous[1] + fraction * (current[1] - previous[1])]);
    }
    if (inside(current)) output.push(current);
    previous = current;
  }
  return output;
}

function clippedPolygon(rings: MapCoordinate[][]): Geometry | null {
  if (!rings.length || rings.some((ring) => ring.length < 4 || !ring.every(validCoordinate))) return null;
  const unwrapped = rings.map(unwrapRing);
  const exterior = unwrapped[0];
  const longitudes = exterior.map((point) => point[0]);
  const minimum = Math.min(...longitudes);
  const maximum = Math.max(...longitudes);
  const middle = (minimum + maximum) / 2;
  // A hole can start on the opposite side of the seam; align it with its exterior.
  for (let index = 1; index < unwrapped.length; index += 1) {
    const ring = unwrapped[index];
    const offset = Math.round((middle - ring.reduce((sum, point) => sum + point[0], 0) / ring.length) / 360) * 360;
    unwrapped[index] = ring.map(([longitude, latitude]) => [longitude + offset, latitude]);
  }
  const polygons: MapCoordinate[][][] = [];
  for (let band = Math.floor((minimum + 180) / 360); band <= Math.floor((maximum + 180) / 360); band += 1) {
    const clipped: MapCoordinate[][] = [];
    for (const ring of unwrapped) {
      let result = clipRing(ring, -180 + band * 360, true);
      if (result.length) result = clipRing(result, 180 + band * 360, false);
      result = result.map(([longitude, latitude]) => [longitude - band * 360, latitude]);
      // Remove adjacent duplicate vertices introduced by clipping a closed seam.
      result = result.filter((point, index) => index === 0 || point[0] !== result[index - 1][0] || point[1] !== result[index - 1][1]);
      if (result.length && (result[0][0] !== result.at(-1)![0] || result[0][1] !== result.at(-1)![1])) result.push([...result[0]]);
      if (result.length < 4) {
        if (ring === unwrapped[0]) break;
        continue;
      }
      clipped.push(result);
    }
    if (clipped.length) polygons.push(clipped);
  }
  if (!polygons.length) return null;
  return polygons.length === 1 ? { type: "Polygon", coordinates: polygons[0] } : { type: "MultiPolygon", coordinates: polygons };
}

export function prepareOverlayGeometry(geometry: MapGeometry): Geometry | null {
  if (geometry.type === "Point") return validCoordinate(geometry.coordinates) ? geometry : null;
  if (geometry.type === "Polygon") return clippedPolygon(geometry.coordinates);
  const lines = geometry.type === "LineString"
    ? splitAntimeridianLine(geometry.coordinates)
    : geometry.coordinates.flatMap(splitAntimeridianLine);
  if (!lines.length) return null;
  return lines.length === 1 ? { type: "LineString", coordinates: lines[0] } : { type: "MultiLineString", coordinates: lines };
}

export function prepareOverlays(features: MapFeature[], selectedId: string | null): PreparedOverlay[] {
  const seen = new Set<string>();
  return features.flatMap((feature): PreparedOverlay[] => {
    const metadata = OVERLAY_LAYERS[feature.properties.layer];
    if (!metadata || seen.has(feature.id) || !validCoordinate(feature.properties.anchor)) return [];
    const geometry = prepareOverlayGeometry(feature.geometry);
    if (!geometry) return [];
    seen.add(feature.id);
    return [{ feature, geometry, properties: {
      entityId: feature.id, layer: feature.properties.layer, color: metadata.color,
      icon: `overlay-${overlayIcon(feature).key}${feature.properties.positionKind === "approximate-region" ? "-region" : ""}`, selected: feature.id === selectedId,
      approximate: feature.properties.positionKind === "approximate-region",
      dashed: feature.properties.positionKind === "reference-route" || feature.properties.positionKind === "predicted",
      heading: ["aviation", "maritime"].includes(feature.properties.layer) && Number.isFinite(feature.properties.heading) ? feature.properties.heading! : 0,
    } }];
  });
}

export function isOverlayShapeVisible(overlay: PreparedOverlay): boolean {
  return overlay.geometry.type !== "Point" && (overlay.feature.properties.layer !== "satellites" || overlay.properties.selected);
}

export function overlayCollections(overlays: PreparedOverlay[]): {
  points: FeatureCollection<Geometry, OverlayProperties>;
  shapes: FeatureCollection<Geometry, OverlayProperties>;
} {
  const points: Feature<Geometry, OverlayProperties>[] = [];
  const shapes: Feature<Geometry, OverlayProperties>[] = [];
  for (const overlay of overlays) {
    const properties = overlay.properties;
    points.push({ type: "Feature", id: overlay.feature.id, properties, geometry: { type: "Point", coordinates: overlay.feature.properties.anchor } });
    if (isOverlayShapeVisible(overlay)) shapes.push({ type: "Feature", id: overlay.feature.id, properties, geometry: overlay.geometry });
  }
  return { points: { type: "FeatureCollection", features: points }, shapes: { type: "FeatureCollection", features: shapes } };
}
