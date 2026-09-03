import { describe, expect, it } from "vitest";
import type { IndustryLeaderQuote } from "../../shared/types";
import { classifyLeaderQuote, markLeaderQuoteBatchFailure, mergeLeaderQuoteHealth, quoteFreshnessLabel, trustedQuoteTimestamp } from "./industry-leader-freshness";

const now = Date.parse("2026-08-24T07:04:00.000Z");
const quote = (overrides: Partial<IndustryLeaderQuote> = {}): IndustryLeaderQuote => ({
  status: "available",
  tradingState: "trading",
  realtime: true,
  price: 100,
  previousClose: 99,
  changePercent: 1,
  marketCap: 1_000_000,
  currency: "USD",
  marketCapCurrency: "USD",
  provider: "测试公开行情",
  updatedAt: new Date(now - 60_000).toISOString(),
  reason: null,
  ...overrides,
});

describe("industry leader quote freshness", () => {
  it("rejects missing, invalid and future provider timestamps", () => {
    expect(trustedQuoteTimestamp(null, now)).toBeNull();
    expect(trustedQuoteTimestamp("invalid", now)).toBeNull();
    expect(trustedQuoteTimestamp(new Date(now + 1).toISOString(), now)).toBeNull();
  });

  it("moves from live to delayed without waiting for another response", () => {
    const updatedAt = new Date(now - 3 * 60_000).toISOString();
    expect(classifyLeaderQuote(quote({ updatedAt }), now)).toBe("live");
    expect(classifyLeaderQuote(quote({ updatedAt }), now + 1)).toBe("delayed");
  });

  it("keeps closed and unknown states distinct", () => {
    expect(classifyLeaderQuote(quote({ tradingState: "closed", realtime: false }), now)).toBe("closed");
    expect(classifyLeaderQuote(quote({ updatedAt: null }), now)).toBe("unknown");
    expect(classifyLeaderQuote(quote({ status: "unavailable", price: null, changePercent: null }), now)).toBe("unavailable");
  });

  it("recomputes a market's closed state after the response arrives", () => {
    // 06:04 UTC is 14:04 Beijing time: the A-share afternoon session is open.
    const inSession = Date.parse("2026-08-24T06:04:00.000Z");
    expect(classifyLeaderQuote(quote({ updatedAt: new Date(inSession - 60_000).toISOString() }), inSession, undefined, "cn")).toBe("live");
    // 09:10 UTC is 17:10 Beijing time, after the close, without a new request.
    expect(classifyLeaderQuote(quote(), Date.parse("2026-08-24T09:10:00.000Z"), undefined, "cn")).toBe("closed");
  });

  it("marks partial and repeated batch failures explicitly", () => {
    expect(classifyLeaderQuote(quote(), now, { consecutiveFailures: 0, missing: true })).toBe("error");
    expect(classifyLeaderQuote(quote(), now, { consecutiveFailures: 2, missing: false })).toBe("error");
    expect(quoteFreshnessLabel("error")).toContain("更新失败");
  });

  it("keeps a missing symbol's failure fact and clears it after recovery", () => {
    const current = mergeLeaderQuoteHealth(
      ["NVDA.US", "600519.SH"],
      {},
      { "NVDA.US": quote(), },
    );
    expect(current["600519.SH"]).toMatchObject({
      consecutiveFailures: 1,
      missing: true,
      failureReason: "本轮未返回，沿用最近报价",
    });
    const recovered = mergeLeaderQuoteHealth(
      ["NVDA.US", "600519.SH"],
      current,
      { "NVDA.US": quote(), "600519.SH": quote({ updatedAt: new Date(now - 30_000).toISOString() }) },
    );
    expect(recovered["600519.SH"]).toMatchObject({ consecutiveFailures: 0, missing: false, failureReason: null });
  });

  it("increments batch failures without changing quote timestamps", () => {
    const failed = markLeaderQuoteBatchFailure(["NVDA.US"], {}, "网络超时，沿用最近报价");
    expect(failed["NVDA.US"]).toEqual({
      consecutiveFailures: 1,
      missing: false,
      failureReason: "网络超时，沿用最近报价",
    });
    expect(quote({ updatedAt: null }).updatedAt).toBeNull();
  });
});
