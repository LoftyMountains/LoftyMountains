import { NEWS_QUERY_MAX_LIMIT, type FeedNewsItem } from "../../shared/types";

export type NewsQueryCompleteness =
  | { status: "complete"; limit: number }
  | { status: "truncated"; limit: number }
  | { status: "unknown" };

export interface ParsedNewsQueryResponse {
  items: FeedNewsItem[];
  completeness: NewsQueryCompleteness;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

export function parseNewsQueryResponse(payload: unknown): ParsedNewsQueryResponse {
  if (!isRecord(payload) || !Array.isArray(payload.items)) throw new Error("查询响应格式无效");
  const items = payload.items as FeedNewsItem[];
  const result = payload.result;
  if (!isRecord(result)
    || !isNonNegativeInteger(result.returnedCount)
    || result.returnedCount !== items.length
    || !isNonNegativeInteger(result.limit)
    || result.limit < 1
    || result.limit > NEWS_QUERY_MAX_LIMIT
    || result.returnedCount > result.limit
    || typeof result.truncated !== "boolean"
    || (result.truncated && result.returnedCount !== result.limit)) {
    return { items, completeness: { status: "unknown" } };
  }
  return {
    items,
    completeness: result.truncated
      ? { status: "truncated", limit: result.limit }
      : { status: "complete", limit: result.limit },
  };
}
