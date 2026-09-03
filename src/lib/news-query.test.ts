import { describe, expect, it } from "vitest";
import type { FeedNewsItem } from "../../shared/types";
import { parseNewsQueryResponse } from "./news-query";

const items = Array.from({ length: 2 }, (_, index): FeedNewsItem => ({
  id: `test:${index}`,
  externalId: String(index),
  source: "cls",
  sourceLabel: "财联社",
  title: `测试报道 ${index}`,
  content: `测试报道 ${index}`,
  publishedAt: new Date(Date.UTC(2030, 0, 1, 0, index)).toISOString(),
  url: null,
  important: false,
  tags: [],
  eventId: null,
}));

describe("news query response validation", () => {
  it("accepts valid truncated and untruncated metadata", () => {
    expect(parseNewsQueryResponse({
      items,
      result: { returnedCount: 2, limit: 2, truncated: true },
    }).completeness).toEqual({ status: "truncated", limit: 2 });
    expect(parseNewsQueryResponse({
      items,
      result: { returnedCount: 2, limit: 1_000, truncated: false },
    }).completeness).toEqual({ status: "complete", limit: 1_000 });
  });

  it.each([
    undefined,
    { returnedCount: -1, limit: 1_000, truncated: false },
    { returnedCount: 1.5, limit: 1_000, truncated: false },
    { returnedCount: 1, limit: 1_000, truncated: false },
    { returnedCount: 2, limit: 0, truncated: false },
    { returnedCount: 2, limit: 1_001, truncated: false },
    { returnedCount: 2, limit: 1, truncated: false },
    { returnedCount: 2, limit: 3, truncated: true },
    { returnedCount: 2, limit: 2, truncated: "true" },
  ])("degrades missing or inconsistent metadata to unknown (%j)", (result) => {
    expect(parseNewsQueryResponse({ items, result }).completeness).toEqual({ status: "unknown" });
  });

  it("rejects a payload without an item array", () => {
    expect(() => parseNewsQueryResponse({ result: { returnedCount: 0, limit: 1_000, truncated: false } }))
      .toThrow("查询响应格式无效");
  });
});
