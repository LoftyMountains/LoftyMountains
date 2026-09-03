import { describe, expect, it } from "vitest";
import { affectedSources, latestTrustedTimestamp, trustedTimestamp } from "./live-freshness";

describe("live freshness", () => {
  const now = Date.parse("2026-08-30T00:00:00.000Z");
  it("rejects missing, invalid and future timestamps", () => {
    expect(trustedTimestamp(null, now)).toBeNull();
    expect(trustedTimestamp("not-a-date", now)).toBeNull();
    expect(trustedTimestamp("2026-08-30T00:00:01.000Z", now)).toBeNull();
    expect(trustedTimestamp("2026-08-29T23:59:59.000Z", now)).toBe("2026-08-29T23:59:59.000Z");
  });
  it("selects latest trusted content time", () => {
    expect(latestTrustedTimestamp(["2026-08-29T23:00:00.000Z", "2026-08-29T23:30:00.000Z", "bad"], now)).toBe("2026-08-29T23:30:00.000Z");
  });
  it("only reports delayed and offline sources", () => {
    const sources = [
      { id: "cls", label: "财联社", state: "live", itemCount: 1, lastSuccessAt: null, latencyMs: null, message: null },
      { id: "sina", label: "新浪财经", state: "offline", itemCount: 1, lastSuccessAt: null, latencyMs: null, message: "连接失败" },
      { id: "jin10", label: "金十数据", state: "delayed", itemCount: 1, lastSuccessAt: null, latencyMs: null, message: null },
    ] as const;
    expect(affectedSources([...sources])).toHaveLength(2);
    expect(affectedSources([...sources]).map((source) => source.label)).toEqual(["新浪财经", "金十数据"]);
  });
});
