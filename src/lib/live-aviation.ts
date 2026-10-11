import type { LiveAviationSnapshot, MapFeature } from "../../shared/types";

export type AviationCenter = { latitude: number; longitude: number };
export type AviationMode = "live" | "global";
export const LIVE_AIRCRAFT_MAX_AGE_MS = 120_000;
export const LIVE_AIRCRAFT_FRESH_MS = 60_000;
export const LIVE_AVIATION_RADIUS_NM = 250;

export function normalizeAviationCenter(center: AviationCenter): AviationCenter {
  const latitude = Math.max(-90, Math.min(90, Math.round(Number.isFinite(center.latitude) ? center.latitude : 20)));
  const longitude = ((Math.round(Number.isFinite(center.longitude) ? center.longitude : 70) + 180) % 360 + 360) % 360 - 180;
  return { latitude: latitude || 0, longitude: longitude || 0 };
}
export function aviationScopeKey(center: AviationCenter) { return `${center.latitude}:${center.longitude}`; }
export function aviationRefreshDelay(value: unknown): number {
  return Math.max(30_000, Math.min(3_600_000, typeof value === "number" && Number.isFinite(value) ? value : 30_000));
}
export function isCurrentLiveAircraft(feature: MapFeature, now: number): boolean {
  const time = Date.parse(feature.properties.sourceTime || "");
  return Number.isFinite(time) && time <= now + 60_000 && now - time <= LIVE_AIRCRAFT_MAX_AGE_MS;
}
export function currentLiveAircraft(features: MapFeature[], now: number): MapFeature[] {
  return features.filter(feature => isCurrentLiveAircraft(feature, now));
}

/** Reject a response for a superseded map area instead of mixing its aircraft into the new view. */
export function validateLiveAviation(value: unknown, center: AviationCenter): LiveAviationSnapshot {
  if (!value || typeof value !== "object") throw new Error("Invalid aviation response");
  const data = value as LiveAviationSnapshot;
  const states = ["live", "stale", "unavailable"];
  if (data.persisted !== false || !Number.isFinite(Date.parse(data.generatedAt))
    || !Number.isFinite(data.refreshAfterMs) || data.refreshAfterMs < 0
    || !data.scope || data.scope.latitude !== center.latitude || data.scope.longitude !== center.longitude || data.scope.radiusNm !== LIVE_AVIATION_RADIUS_NM
    || !Array.isArray(data.features) || data.features.length > 300
    || !data.status || data.status.id !== "aviation" || !states.includes(data.status.state)
    || !Number.isInteger(data.status.count) || data.status.count !== data.features.length || typeof data.status.message !== "string"
    || !Array.isArray(data.status.sources) || data.status.sources.some(source => typeof source !== "string")
    || data.status.updatedAt !== null && !Number.isFinite(Date.parse(data.status.updatedAt))) throw new Error("Invalid aviation response or area");
  const ids = new Set<string>();
  for (const feature of data.features) {
    const p = feature?.properties;
    const coordinate = feature?.geometry?.type === "Point" ? feature.geometry.coordinates : null;
    if (feature?.type !== "Feature" || typeof feature.id !== "string" || !feature.id || ids.has(feature.id)
      || !p || p.layer !== "aviation" || p.positionKind !== "source-reported" || p.timeKind !== "observation"
      || typeof p.name !== "string" || typeof p.description !== "string" || typeof p.sourceLabel !== "string" || p.sourceId !== "adsb-lol" || typeof p.sourceUrl !== "string"
      || !Number.isFinite(Date.parse(p.sourceTime || "")) || p.positionTime !== p.sourceTime
      || !coordinate || coordinate.length !== 2 || !coordinate.every(Number.isFinite) || Math.abs(coordinate[0]) > 180 || Math.abs(coordinate[1]) > 90
      || !Array.isArray(p.anchor) || p.anchor[0] !== coordinate[0] || p.anchor[1] !== coordinate[1]
      || p.details !== undefined && (!Array.isArray(p.details) || p.details.length > 40 || p.details.some(detail => !detail || typeof detail.label !== "string" || typeof detail.value !== "string"))
      || p.heading !== undefined && (!Number.isFinite(p.heading) || p.heading < 0 || p.heading > 360)) throw new Error("Invalid aircraft observation");
    ids.add(feature.id);
  }
  return data;
}
