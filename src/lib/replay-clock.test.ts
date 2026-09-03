import { describe, expect, it } from "vitest";
import type { FeedNewsItem, MarketPoint, ReplayPayload } from "../../shared/types";
import { formatFull } from "./time";
import {
  DEFAULT_REPLAY_SPEED,
  REPLAY_SPEEDS,
  clampReplayCursor,
  parseReplayResponse,
  replayCursorFromElapsed,
  replaySpeedLabel,
  visibleReplayItemCount,
} from "./replay-clock";

const from = "2030-01-01T01:30:00.000Z";
const to = "2030-01-01T02:00:00.000Z";
const fromMs = Date.parse(from);
const toMs = Date.parse(to);

function news(publishedAt: string, id = publishedAt): FeedNewsItem {
  return {
    id,
    externalId: id,
    source: "cls",
    sourceLabel: "财联社",
    title: `报道 ${id}`,
    content: `报道 ${id}`,
    publishedAt,
    url: null,
    important: false,
    tags: [],
    eventId: null,
  };
}

function point(timestamp: string, price = 4200): MarketPoint {
  return { timestamp, price, average: price, volume: 1, change: 0, changePercent: 0 };
}

function replayPayload(overrides: Partial<ReplayPayload> = {}): ReplayPayload {
  return {
    from,
    to,
    news: [news(from)],
    market: {
      symbol: "000300",
      name: "沪深300",
      previousClose: 4200,
      points: [point(from)],
      delayed: false,
      updatedAt: from,
      source: null,
      sourceLabel: null,
      lastSuccessAt: null,
      latencyMs: null,
      switchReason: null,
      fallbackActive: false,
    },
    ...overrides,
  };
}

describe("continuous replay clock", () => {
  it("maps monotonic elapsed time to all four declared historical rates", () => {
    expect(REPLAY_SPEEDS.map((speed) => replaySpeedLabel(speed))).toEqual([
      "1 分钟/秒",
      "2 分钟/秒",
      "5 分钟/秒",
      "10 分钟/秒",
    ]);
    expect(DEFAULT_REPLAY_SPEED).toBe(120);
    expect(REPLAY_SPEEDS.map((speed) => replayCursorFromElapsed(fromMs, 250, speed, fromMs, toMs) - fromMs))
      .toEqual([15_000, 30_000, 75_000, 150_000]);
  });

  it("uses total elapsed time instead of callback counts or data density", () => {
    expect(replayCursorFromElapsed(fromMs, 250, 120, fromMs, toMs)).toBe(fromMs + 30_000);
    expect(replayCursorFromElapsed(fromMs, 500, 120, fromMs, toMs)).toBe(fromMs + 60_000);
    expect(replayCursorFromElapsed(fromMs, 1_000, 120, fromMs, toMs)).toBe(fromMs + 120_000);
    expect(replayCursorFromElapsed(fromMs, 750, 120, fromMs, toMs)).toBe(fromMs + 90_000);
    expect(replayCursorFromElapsed(fromMs, 750, 120, fromMs, toMs)).toBe(
      replayCursorFromElapsed(fromMs, 250 + 500, 120, fromMs, toMs),
    );
  });

  it("keeps pause time out of resume and applies a new rate only after settlement", () => {
    const pausedAt = replayCursorFromElapsed(fromMs, 500, 120, fromMs, toMs);
    expect(pausedAt).toBe(fromMs + 60_000);
    expect(pausedAt).toBe(pausedAt);
    const resumedAt = replayCursorFromElapsed(pausedAt, 250, 120, fromMs, toMs);
    expect(resumedAt).toBe(fromMs + 90_000);
    const afterSpeedChange = replayCursorFromElapsed(pausedAt, 250, 300, fromMs, toMs);
    expect(afterSpeedChange).toBe(fromMs + 135_000);
  });

  it("clamps at both boundaries and exposes equal timestamps atomically", () => {
    expect(clampReplayCursor(fromMs - 1, fromMs, toMs)).toBe(fromMs);
    expect(replayCursorFromElapsed(toMs - 10_000, 1_000, 600, fromMs, toMs)).toBe(toMs);
    expect(visibleReplayItemCount([fromMs, fromMs + 60_000, fromMs + 60_000, toMs], fromMs + 59_999)).toBe(1);
    expect(visibleReplayItemCount([fromMs, fromMs + 60_000, fromMs + 60_000, toMs], fromMs + 60_000)).toBe(3);
    expect(() => clampReplayCursor(fromMs, toMs, fromMs)).toThrow("回放时钟边界无效");
  });

  it("validates boundaries and timestamps, filters out-of-range data, and sorts once", () => {
    const before = "2030-01-01T01:29:59.000Z";
    const middle = "2030-01-01T01:45:00.000Z";
    const after = "2030-01-01T02:00:01.000Z";
    const parsed = parseReplayResponse(replayPayload({
      news: [news(after, "after"), news(middle, "middle"), news(before, "before"), news(from, "from")],
      market: { ...replayPayload().market, points: [point(after), point(middle), point(before), point(from)] },
    }));

    expect(parsed.payload.news.map((item) => item.id)).toEqual(["from", "middle"]);
    expect(parsed.payload.market.points.map((item) => item.timestamp)).toEqual([from, middle]);
    expect(parsed.newsTimes).toEqual([fromMs, Date.parse(middle)]);
    expect(parsed.marketTimes).toEqual([fromMs, Date.parse(middle)]);
    expect(() => parseReplayResponse({ ...replayPayload(), from: "invalid" })).toThrow("from 不是有效 ISO 时间");
    expect(() => parseReplayResponse({ ...replayPayload(), from: to })).toThrow("结束时间需晚于起始时间");
    expect(() => parseReplayResponse({ ...replayPayload(), news: [{ ...news(from), publishedAt: "invalid" }] })).toThrow("publishedAt");
    expect(() => parseReplayResponse({ ...replayPayload(), market: { ...replayPayload().market, points: "invalid" } })).toThrow("market.points 不是数组");
  });

  it("rejects nonexistent calendar dates and invalid offsets without Date.parse normalization", () => {
    expect(() => parseReplayResponse({ ...replayPayload(), from: "2026-02-30T01:00:00.000Z" })).toThrow("from 不是有效 ISO 时间");
    expect(() => parseReplayResponse({ ...replayPayload(), from: "2025-02-29T01:00:00.000Z" })).toThrow("from 不是有效 ISO 时间");
    expect(() => parseReplayResponse({ ...replayPayload(), news: [news("2026-04-31T01:00:00.000Z")] })).toThrow("publishedAt");
    expect(() => parseReplayResponse({ ...replayPayload(), market: { ...replayPayload().market, points: [point("2030-01-01T01:00:00+24:00")] } })).toThrow("timestamp");
    expect(() => parseReplayResponse({ ...replayPayload(), from: "2028-02-29T01:00:00+08:00", to: "2028-02-29T02:00:00+08:00" })).not.toThrow();
  });

  it("keeps UTC epoch arithmetic separate from Beijing display across a date boundary", () => {
    const utcBoundary = Date.parse("2029-12-31T15:59:30.000Z");
    const cursor = replayCursorFromElapsed(utcBoundary, 500, 60, utcBoundary, utcBoundary + 60_000);
    expect(cursor).toBe(Date.parse("2029-12-31T16:00:00.000Z"));
    expect(formatFull(cursor)).toBe("2030/01/01 00:00:00");
  });
});
