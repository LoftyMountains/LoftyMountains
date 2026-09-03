import type { FeedNewsItem, MarketPoint, ReplayPayload } from "../../shared/types";

export const REPLAY_SPEEDS = [60, 120, 300, 600] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];
export const DEFAULT_REPLAY_SPEED: ReplaySpeed = 120;

export interface ValidatedReplay {
  payload: ReplayPayload;
  fromMs: number;
  toMs: number;
  newsTimes: number[];
  marketTimes: number[];
}

const isoTimestampPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseIsoTimestamp(value: unknown, field: string) {
  if (typeof value !== "string") {
    throw new Error(`回放响应格式无效：${field} 不是有效 ISO 时间`);
  }
  const match = isoTimestampPattern.exec(value);
  if (!match) throw new Error(`回放响应格式无效：${field} 不是有效 ISO 时间`);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText = "", offsetText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const daysInMonth = month === 2
    ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28)
    : [4, 6, 9, 11].includes(month) ? 30 : 31;
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) {
    throw new Error(`回放响应格式无效：${field} 不是有效 ISO 时间`);
  }
  const offsetMinutes = offsetText === "Z" ? 0 : (() => {
    const sign = offsetText.startsWith("-") ? -1 : 1;
    const [hours, minutes] = offsetText.slice(1).split(":").map(Number);
    if (hours > 23 || minutes > 59) return Number.NaN;
    return sign * (hours * 60 + minutes);
  })();
  if (!Number.isFinite(offsetMinutes)) throw new Error(`回放响应格式无效：${field} 不是有效 ISO 时间`);
  const milliseconds = Number((fractionText + "000").slice(0, 3));
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, milliseconds);
  const timestamp = date.getTime() - offsetMinutes * 60_000;
  if (!Number.isFinite(timestamp)) throw new Error(`回放响应格式无效：${field} 不是有效 ISO 时间`);
  return timestamp;
}

export function isReplaySpeed(value: number): value is ReplaySpeed {
  return REPLAY_SPEEDS.some((speed) => speed === value);
}

export function replaySpeedLabel(speed: ReplaySpeed) {
  return `${speed / 60} 分钟/秒`;
}

export function clampReplayCursor(cursorMs: number, fromMs: number, toMs: number) {
  if (![cursorMs, fromMs, toMs].every(Number.isFinite) || fromMs >= toMs) {
    throw new Error("回放时钟边界无效");
  }
  return Math.min(toMs, Math.max(fromMs, cursorMs));
}

export function replayCursorFromElapsed(
  anchorCursorMs: number,
  elapsedMs: number,
  speed: ReplaySpeed,
  fromMs: number,
  toMs: number,
) {
  const monotonicElapsedMs = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  return clampReplayCursor(anchorCursorMs + monotonicElapsedMs * speed, fromMs, toMs);
}

export function visibleReplayItemCount(sortedTimes: readonly number[], cursorMs: number) {
  let low = 0;
  let high = sortedTimes.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (sortedTimes[middle]! <= cursorMs) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function parseReplayResponse(value: unknown): ValidatedReplay {
  if (!isRecord(value)) throw new Error("回放响应格式无效：响应不是对象");
  const fromMs = parseIsoTimestamp(value.from, "from");
  const toMs = parseIsoTimestamp(value.to, "to");
  if (fromMs >= toMs) throw new Error("回放响应格式无效：结束时间需晚于起始时间");
  if (!Array.isArray(value.news)) throw new Error("回放响应格式无效：news 不是数组");
  if (!isRecord(value.market) || !Array.isArray(value.market.points)) {
    throw new Error("回放响应格式无效：market.points 不是数组");
  }

  const newsEntries = value.news.map((item, index) => {
    if (!isRecord(item)) throw new Error(`回放响应格式无效：news[${index}] 不是对象`);
    return { item: item as unknown as FeedNewsItem, timestamp: parseIsoTimestamp(item.publishedAt, `news[${index}].publishedAt`) };
  }).filter(({ timestamp }) => timestamp >= fromMs && timestamp <= toMs)
    .sort((left, right) => left.timestamp - right.timestamp);

  const marketEntries = value.market.points.map((point, index) => {
    if (!isRecord(point)) throw new Error(`回放响应格式无效：market.points[${index}] 不是对象`);
    return { point: point as unknown as MarketPoint, timestamp: parseIsoTimestamp(point.timestamp, `market.points[${index}].timestamp`) };
  }).filter(({ timestamp }) => timestamp >= fromMs && timestamp <= toMs)
    .sort((left, right) => left.timestamp - right.timestamp);

  const payload: ReplayPayload = {
    from: value.from as string,
    to: value.to as string,
    news: newsEntries.map(({ item }) => item),
    market: {
      ...(value.market as unknown as ReplayPayload["market"]),
      points: marketEntries.map(({ point }) => point),
    },
  };

  return {
    payload,
    fromMs,
    toMs,
    newsTimes: newsEntries.map(({ timestamp }) => timestamp),
    marketTimes: marketEntries.map(({ timestamp }) => timestamp),
  };
}
