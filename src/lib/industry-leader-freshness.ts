import type { IndustryLeaderMarket, IndustryLeaderQuote } from "../../shared/types";

export type LeaderQuoteHealth = {
  consecutiveFailures: number;
  missing: boolean;
  /** The latest failure fact, kept separate from the provider timestamp. */
  failureReason?: string | null;
};

export type LeaderQuoteFreshness = "live" | "delayed" | "closed" | "unknown" | "unavailable" | "error";

function marketSessionOpen(now: number, market: IndustryLeaderMarket) {
  const timeZone = market === "us" ? "America/New_York" : "Asia/Shanghai";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(now));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  const weekday = value("weekday");
  if (weekday === "Sat" || weekday === "Sun") return false;
  const minute = Number(value("hour")) * 60 + Number(value("minute"));
  if (market === "cn") return (minute >= 570 && minute < 690) || (minute >= 780 && minute < 900);
  if (market === "hk") return (minute >= 570 && minute < 720) || (minute >= 780 && minute < 960);
  return minute >= 570 && minute < 960;
}

export function trustedQuoteTimestamp(value: string | null | undefined, now = Date.now()) {
  // Provider timestamps must carry an explicit timezone. Date.parse accepts
  // locale-dependent strings, which would make freshness differ by browser.
  if (!value || !/(?:T| )[0-9]{2}:[0-9]{2}(?::[0-9]{2}(?:\.[0-9]+)?)?(?:Z|[+-][0-9]{2}:?[0-9]{2})$/.test(value)) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > now) return null;
  return timestamp;
}

export function classifyLeaderQuote(
  quote: IndustryLeaderQuote,
  now = Date.now(),
  health: LeaderQuoteHealth = { consecutiveFailures: 0, missing: false },
  market?: IndustryLeaderMarket,
): LeaderQuoteFreshness {
  if (quote.status !== "available") return "unavailable";
  if (quote.tradingState === "closed" || (market && !marketSessionOpen(now, market))) return "closed";
  if (health.missing || health.consecutiveFailures >= 2) return "error";
  const updatedAt = trustedQuoteTimestamp(quote.updatedAt, now);
  if (!updatedAt) return "unknown";
  if (quote.tradingState !== "trading") return "unknown";
  return now - updatedAt <= 3 * 60_000 ? "live" : "delayed";
}

/**
 * Merge one batch response into per-symbol health without inventing a quote
 * timestamp. A missing or unavailable symbol is retained by the caller, while
 * this state makes the affected row and batch summary observable.
 */
export function mergeLeaderQuoteHealth(
  symbols: string[],
  current: Record<string, LeaderQuoteHealth>,
  quotes: Record<string, IndustryLeaderQuote>,
): Record<string, LeaderQuoteHealth> {
  return Object.fromEntries(symbols.map((symbol) => {
    const quote = quotes[symbol];
    const previous = current[symbol] || { consecutiveFailures: 0, missing: false };
    if (quote?.status === "available") {
      return [symbol, { consecutiveFailures: 0, missing: false, failureReason: null }];
    }
    return [symbol, {
      consecutiveFailures: previous.consecutiveFailures + 1,
      missing: !quote,
      failureReason: quote?.reason || (!quote ? "本轮未返回，沿用最近报价" : "行情不可用，沿用最近报价"),
    }];
  }));
}

export function markLeaderQuoteBatchFailure(
  symbols: string[],
  current: Record<string, LeaderQuoteHealth>,
  reason = "行情更新失败，沿用最近报价",
): Record<string, LeaderQuoteHealth> {
  return Object.fromEntries(symbols.map((symbol) => {
    const previous = current[symbol] || { consecutiveFailures: 0, missing: false };
    return [symbol, {
      consecutiveFailures: previous.consecutiveFailures + 1,
      missing: false,
      failureReason: reason,
    }];
  }));
}

export function quoteFreshnessLabel(state: LeaderQuoteFreshness) {
  switch (state) {
    case "live": return "实时";
    case "delayed": return "延迟/可能陈旧";
    case "closed": return "收盘";
    case "error": return "更新失败/可能陈旧";
    case "unavailable": return "行情不可用";
    default: return "更新时间未知";
  }
}

export function quoteFreshnessClass(state: LeaderQuoteFreshness) {
  return state === "live" ? "is-live"
    : state === "delayed" ? "is-delayed"
      : state === "closed" ? "is-closed"
        : state === "error" ? "is-error"
          : state === "unavailable" ? "is-unavailable"
            : "is-unknown";
}
