import { describe, expect, it } from "vitest";
import { geoArea } from "d3";
import type { MapFeature, MapGeometry } from "../../shared/types";
import { overlayCollections, overlayIcon, prepareOverlayGeometry, prepareOverlays, splitAntimeridianLine } from "./map-overlays";

function feature(id: string, geometry: MapGeometry, overrides: Partial<MapFeature["properties"]> = {}): MapFeature {
  return { type: "Feature", id, geometry, properties: {
    layer: "satellites", name: id, eventType: "satellite", anchor: [179, 10], sourceId: "celestrak", sourceLabel: "CelesTrak", sourceUrl: "https://celestrak.org/",
    sourceTime: "2026-10-11T00:00:00Z", timeKind: "prediction", positionKind: "predicted", description: "轨道预测", ...overrides,
  } };
}

describe("overlay geometry on either side of the antimeridian", () => {
  it("cuts eastbound and westbound tracks at matching seam latitudes", () => {
    expect(splitAntimeridianLine([[170, 0], [-170, 20]])).toEqual([[[170, 0], [180, 10]], [[-180, 10], [-170, 20]]]);
    expect(splitAntimeridianLine([[-170, 0], [170, 20]])).toEqual([[[-170, 0], [-180, 10]], [[180, 10], [170, 20]]]);
  });
  it("does not draw a world-spanning line when a supplied point is exactly on the seam", () => {
    expect(splitAntimeridianLine([[179, 1], [-180, 2], [-179, 3]])).toEqual([[[179, 1], [180, 2]], [[-180, 2], [-180, 2], [-179, 3]]]);
    expect(splitAntimeridianLine([[180, 1], [-180, 2], [-179, 3]])).toEqual([[[-180, 1], [-180, 2], [-179, 3]]]);
  });
  it("keeps ordinary and already separated tracks intact", () => {
    const lines: MapGeometry = { type: "MultiLineString", coordinates: [[[5, 1], [25, 2]], [[-25, 3], [-5, 4]]] };
    expect(prepareOverlayGeometry(lines)).toEqual(lines);
  });
  it("splits a weather polygon into small seam-adjacent polygons instead of shading the whole world", () => {
    const geometry = prepareOverlayGeometry({ type: "Polygon", coordinates: [[[170, -10], [-170, -10], [-170, 10], [170, 10], [170, -10]]] });
    expect(geometry?.type).toBe("MultiPolygon");
    if (geometry?.type !== "MultiPolygon") throw new Error("Expected split polygon");
    expect(geometry.coordinates).toHaveLength(2);
    for (const polygon of geometry.coordinates) {
      expect(Math.max(...polygon[0].map((point) => point[0])) - Math.min(...polygon[0].map((point) => point[0]))).toBeLessThanOrEqual(10);
      expect(polygon[0][0]).toEqual(polygon[0].at(-1));
      const area = geoArea({ type: "Polygon", coordinates: polygon });
      expect(Math.min(area, Math.PI * 4 - area)).toBeLessThan(.1);
    }
  });
  it("preserves holes that also cross the seam", () => {
    const geometry = prepareOverlayGeometry({ type: "Polygon", coordinates: [
      [[170, -10], [-170, -10], [-170, 10], [170, 10], [170, -10]],
      [[-175, -5], [175, -5], [175, 5], [-175, 5], [-175, -5]],
    ] });
    expect(geometry?.type).toBe("MultiPolygon");
    if (geometry?.type === "MultiPolygon") expect(geometry.coordinates.map((polygon) => polygon.length)).toEqual([2, 2]);
  });
  it("rejects non-finite or out-of-range positions instead of inventing an anchor", () => {
    expect(prepareOverlayGeometry({ type: "Point", coordinates: [0, Number.NaN] })).toBeNull();
    expect(prepareOverlays([feature("bad", { type: "Point", coordinates: [0, 1] }, { anchor: [0, 91] })], null)).toEqual([]);
    expect(splitAntimeridianLine([[170, 0], [200, 20]])).toEqual([]);
  });
});

describe("overlay presentation contract", () => {
  it("distinguishes reported weather event types without representing every event as a storm", () => {
    for (const [eventType, kind] of [["野火", "fire"], ["洪水", "water"], ["热带气旋", "cyclone"], ["火山", "volcano"], ["干旱", "temperature"], ["海冰与湖冰", "ice"]]) {
      expect(overlayIcon(feature(eventType, { type: "Point", coordinates: [0, 0] }, { layer: "weather", eventType })).key).toBe(`weather-${kind}`);
    }
  });
  it("keeps source positions, approximate regions, reference routes and predictions distinct", () => {
    const features = [
      feature("prediction", { type: "LineString", coordinates: [[10, 1], [20, 2]] }),
      feature("route", { type: "LineString", coordinates: [[10, 1], [20, 2]] }, { layer: "maritime", positionKind: "reference-route", timeKind: "reference" }),
      feature("region", { type: "Point", coordinates: [10, 1] }, { layer: "health", positionKind: "approximate-region" }),
      feature("plane", { type: "Point", coordinates: [10, 1] }, { layer: "aviation", positionKind: "source-reported", heading: 45 }),
    ];
    const overlays = prepareOverlays(features, "plane");
    expect(overlays.map((overlay) => overlay.properties.dashed)).toEqual([true, true, false, false]);
    expect(overlays[2].properties).toMatchObject({ approximate: true, icon: "overlay-health-region" });
    expect(overlays[3].properties).toMatchObject({ selected: true, heading: 45 });
    const collections = overlayCollections(overlays);
    expect(collections.points.features).toHaveLength(4);
    expect(collections.shapes.features).toHaveLength(1);
    expect(collections.points.features[0].geometry).toEqual({ type: "Point", coordinates: features[0].properties.anchor });
  });
  it("shows all satellite anchors but only the selected satellite track, while retaining shipping routes", () => {
    const geometry: MapGeometry = { type: "LineString", coordinates: [[10, 1], [20, 2]] };
    const records = [feature("sat-a", geometry), feature("sat-b", geometry), feature("sea", geometry, { layer: "maritime", positionKind: "reference-route" })];
    expect(overlayCollections(prepareOverlays(records, null)).shapes.features.map((entry) => entry.id)).toEqual(["sea"]);
    const selected = overlayCollections(prepareOverlays(records, "sat-b"));
    expect(selected.points.features.map((entry) => entry.id)).toEqual(["sat-a", "sat-b", "sea"]);
    expect(selected.shapes.features.map((entry) => entry.id)).toEqual(["sat-b", "sea"]);
  });
  it("deduplicates entity ids and clears removed layers without retaining stale geometry", () => {
    const record = feature("same", { type: "Point", coordinates: [10, 1] });
    expect(prepareOverlays([record, record], null)).toHaveLength(1);
    expect(overlayCollections([])).toEqual({ points: { type: "FeatureCollection", features: [] }, shapes: { type: "FeatureCollection", features: [] } });
  });
});
