import { describe, expect, it } from "vitest";
import type { FeedNewsItem, SourceId } from "../../shared/types";
import { groupNewsEvents, newsLinkAccess, safeNewsUrl, shouldShowNewsContent } from "./news-events";

function news(id: string, source: SourceId, publishedAt: string, eventId: string | null, overrides: Partial<FeedNewsItem> = {}): FeedNewsItem {
  return {
    id,
    externalId: id,
    source,
    sourceLabel: source,
    title: `报道 ${id}`,
    content: `报道 ${id}`,
    publishedAt,
    url: `https://example.com/${id}`,
    important: false,
    tags: [],
    eventId,
    ...overrides,
  };
}

describe("eventized news feed", () => {
  it("groups visible reports once and derives the latest representative and counts", () => {
    const grouped = groupNewsEvents([
      news("old", "cls", "2030-01-01T01:00:00.000Z", "shared", { important: true }),
      news("other", "jin10", "2030-01-01T03:00:00.000Z", "other"),
      news("latest", "sina", "2030-01-01T02:00:00.000Z", "shared"),
      news("latest", "sina", "2030-01-01T02:00:00.000Z", "shared"),
    ]);

    expect(grouped.map((event) => event.key)).toEqual(["event:other", "event:shared"]);
    expect(grouped[1]).toMatchObject({
      publishedAt: "2030-01-01T01:00:00.000Z",
      latestAt: "2030-01-01T02:00:00.000Z",
      sourceCount: 2,
      itemCount: 2,
      important: true,
    });
    expect(grouped[1].representative.id).toBe("latest");
    expect(grouped[1].items.map((item) => item.id)).toEqual(["latest", "old"]);
  });

  it("keeps every malformed event ID as a readable single-report event", () => {
    const invalidIds: unknown[] = [null, undefined, 12, "", "   ", " shared", "shared ", "bad\u0000id", "bad\u200Bid", "x".repeat(201)];
    const items = invalidIds.map((eventId, index) => ({
      ...news(`bad-${index}`, index % 2 ? "sina" : "cls", new Date(Date.UTC(2030, 0, 1, 0, index)).toISOString(), null),
      eventId,
    })) as FeedNewsItem[];
    const grouped = groupNewsEvents(items);

    expect(grouped).toHaveLength(invalidIds.length);
    expect(grouped.every((event) => event.itemCount === 1)).toBe(true);
    expect(new Set(grouped.map((event) => event.key)).size).toBe(invalidIds.length);
    expect(groupNewsEvents([
      news("valid-1", "cls", "2030-01-01T01:00:00.000Z", "event:valid"),
      news("valid-2", "sina", "2030-01-01T01:01:00.000Z", "event:valid"),
    ])).toHaveLength(1);
  });

  it("recomputes event evidence from the already-filtered input", () => {
    const items = [
      news("cls", "cls", "2030-01-01T01:00:00.000Z", "shared", { important: true }),
      news("sina", "sina", "2030-01-01T02:00:00.000Z", "shared"),
    ];
    const [event] = groupNewsEvents(items.filter((item) => item.source === "sina"));

    expect(event).toMatchObject({ sourceCount: 1, itemCount: 1, important: false });
    expect(event.representative.id).toBe("sina");
  });

  it("suppresses punctuation and source-prefix duplicates but keeps new facts", () => {
    expect(shouldShowNewsContent("沪指上涨 1%", "财联社：沪指上涨1%。")).toBe(false);
    expect(shouldShowNewsContent("沪指上涨 1%", "沪指上涨1%，成交额突破一万亿元")).toBe(true);
  });

  it("only accepts absolute HTTP(S) original links", () => {
    expect(safeNewsUrl("https://example.com/news")).toBe("https://example.com/news");
    expect(safeNewsUrl("http://example.com/news")).toBe("http://example.com/news");
    expect(safeNewsUrl("javascript:alert(1)")).toBeNull();
    expect(safeNewsUrl("/relative-news")).toBeNull();
  });

  it("distinguishes single articles from missing, aggregate, and invalid links", () => {
    expect(newsLinkAccess("https://example.com/news?id=one")).toEqual({ kind: "article", url: "https://example.com/news?id=one" });
    expect(newsLinkAccess("https://finance.sina.com.cn/7x24/?source=feed#latest")).toEqual({
      kind: "source-page",
      url: "https://finance.sina.com.cn/7x24/?source=feed#latest",
    });
    expect(newsLinkAccess("https://www.cls.cn/telegraph")).toEqual({ kind: "source-page", url: "https://www.cls.cn/telegraph" });
    expect(newsLinkAccess(null)).toEqual({ kind: "missing" });
    expect(newsLinkAccess("javascript:alert(1)")).toEqual({ kind: "invalid" });
    expect(newsLinkAccess("not a url")).toEqual({ kind: "invalid" });
  });

  it("groups 500 reports within the feed performance budget", () => {
    const items = Array.from({ length: 500 }, (_, index) => news(
      `item-${index}`,
      index % 2 ? "cls" : "sina",
      new Date(Date.UTC(2030, 0, 1, 0, index)).toISOString(),
      `event-${Math.floor(index / 4)}`,
    ));
    const timings: number[] = [];
    for (let run = 0; run < 20; run += 1) {
      const started = performance.now();
      groupNewsEvents(items);
      timings.push(performance.now() - started);
    }
    timings.sort((left, right) => left - right);
    expect(timings[Math.ceil(timings.length * 0.95) - 1]).toBeLessThan(10);
  });
});
