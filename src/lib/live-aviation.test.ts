import { describe, expect, it } from "vitest";
import type { LiveAviationSnapshot, MapFeature } from "../../shared/types";
import { aviationRefreshDelay, aviationScopeKey, currentLiveAircraft, normalizeAviationCenter, validateLiveAviation } from "./live-aviation";

const now = Date.parse("2026-10-12T00:00:00Z");
const center = { latitude: 20, longitude: 70 };
function feature(age = 0): MapFeature {
  const time = new Date(now - age).toISOString();
  return { type: "Feature", id: "aircraft:abc123", geometry: { type: "Point", coordinates: [70, 20] }, properties: {
    layer: "aviation", name: "Synthetic aircraft", eventType: "Synthetic observation", anchor: [70, 20], sourceId: "adsb-lol", sourceLabel: "ADSB.lol", sourceUrl: "https://example.invalid", sourceTime: time, positionTime: time, timeKind: "observation", positionKind: "source-reported", description: "Synthetic browser/unit-test fixture, not a real observation.",
  } };
}
function snapshot(): LiveAviationSnapshot {
  return { generatedAt: new Date(now).toISOString(), persisted: false, refreshAfterMs: 30_000, scope: { ...center, radiusNm: 250 }, features: [feature()], status: { id: "aviation", label: "Aircraft", state: "live", updatedAt: new Date(now).toISOString(), count: 1, message: "Synthetic fixture", sources: ["ADSB.lol"] } };
}
describe("live aviation current-snapshot contract", () => {
  it("normalizes whole-degree request scopes consistently across the dateline and negative zero", () => {
    expect(normalizeAviationCenter({ latitude: 20.49, longitude: 179.8 })).toEqual({ latitude: 20, longitude: -180 });
    expect(normalizeAviationCenter({ latitude: -0.1, longitude: -540 })).toEqual({ latitude: 0, longitude: -180 });
    expect(normalizeAviationCenter({ latitude: 91, longitude: 430 })).toEqual({ latitude: 90, longitude: 70 });
    expect(aviationScopeKey(normalizeAviationCenter({ latitude: 20.4, longitude: 70.4 }))).toBe(aviationScopeKey(center));
  });
  it("bounds polling without erasing a valid provider backoff", () => {
    expect(aviationRefreshDelay(1000)).toBe(30_000);
    expect(aviationRefreshDelay(NaN)).toBe(30_000);
    expect(aviationRefreshDelay(900_000)).toBe(900_000);
    expect(aviationRefreshDelay(86_400_000)).toBe(3_600_000);
  });
  it("expires by observation time while retaining exact reported coordinates", () => {
    const fresh = feature(30_000), boundary = feature(120_000), expired = feature(120_001);
    const result = currentLiveAircraft([fresh, boundary, expired], now);
    expect(result).toEqual([fresh, boundary]);
    expect(result[0]).toBe(fresh);
    expect(result[0].geometry).toEqual({ type: "Point", coordinates: [70, 20] });
    expect(currentLiveAircraft([fresh], now + 120_000)).toEqual([]);
  });
  it("does not replace unknown observation time with retrieval or prediction time", () => {
    const missing = feature(); missing.properties.sourceTime = null;
    const invalid = feature(); invalid.properties.sourceTime = "bad";
    expect(currentLiveAircraft([missing, invalid, feature(-60_001)], now)).toEqual([]);
  });
  it("accepts a valid empty snapshot to clear previous aircraft", () => {
    const empty = snapshot(); empty.features = []; empty.status.count = 0;
    expect(validateLiveAviation(empty, center).features).toEqual([]);
  });
  it("rejects a delayed response from a superseded scope", () => {
    expect(() => validateLiveAviation(snapshot(), { latitude: 25, longitude: 110 })).toThrow("area");
    const wrongRadius = snapshot(); wrongRadius.scope.radiusNm = 500;
    expect(() => validateLiveAviation(wrongRadius, center)).toThrow("area");
  });
  it("rejects duplicated or mismatched point identities and geometry", () => {
    const duplicate = snapshot(); duplicate.features.push(feature()); duplicate.status.count = 2;
    expect(() => validateLiveAviation(duplicate, center)).toThrow("observation");
    const wrongAnchor = snapshot(); wrongAnchor.features[0].properties.anchor = [71, 20];
    expect(() => validateLiveAviation(wrongAnchor, center)).toThrow("observation");
    const line = snapshot(); line.features[0].geometry = { type: "LineString", coordinates: [[70, 20], [71, 20]] };
    expect(() => validateLiveAviation(line, center)).toThrow("observation");
  });
  it("rejects a position timestamp substituted for its source observation and invalid detail values", () => {
    const wrongTime = snapshot(); wrongTime.features[0].properties.positionTime = new Date(now + 1000).toISOString();
    expect(() => validateLiveAviation(wrongTime, center)).toThrow("observation");
    const badDetail = snapshot(); badDetail.features[0].properties.details = [{ label: "Altitude", value: {} as string }];
    expect(() => validateLiveAviation(badDetail, center)).toThrow("observation");
  });
  it("rejects a different provider or a count that does not describe the current features", () => {
    const wrongProvider = snapshot(); wrongProvider.features[0].properties.sourceId = "opensky";
    expect(() => validateLiveAviation(wrongProvider, center)).toThrow("observation");
    const wrongCount = snapshot(); wrongCount.status.count = 10;
    expect(() => validateLiveAviation(wrongCount, center)).toThrow();
  });
  it("rejects persisted or oversized responses and invalid health metadata", () => {
    expect(() => validateLiveAviation({ ...snapshot(), persisted: true }, center)).toThrow();
    expect(() => validateLiveAviation({ ...snapshot(), features: Array.from({ length: 301 }, feature) }, center)).toThrow();
    const invalidState = snapshot(); invalidState.status.sources = null as unknown as string[];
    expect(() => validateLiveAviation(invalidState, center)).toThrow();
  });
});
