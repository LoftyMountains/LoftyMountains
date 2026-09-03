import type { SourceStatus } from "../../shared/types";

export function trustedTimestamp(value: string | null | undefined, now = Date.now()) {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed > now || parsed <= 0) return null;
  return value;
}

export function latestTrustedTimestamp(values: Array<string | null | undefined>, now = Date.now()) {
  let latest: { value: string; epoch: number } | null = null;
  for (const value of values) {
    const trusted = trustedTimestamp(value, now);
    if (!trusted) continue;
    const epoch = Date.parse(trusted);
    if (!latest || epoch > latest.epoch) latest = { value: trusted, epoch };
  }
  return latest?.value ?? null;
}

export function affectedSources(sources: SourceStatus[]) {
  return sources.filter((source) => source.state === "delayed" || source.state === "offline");
}
