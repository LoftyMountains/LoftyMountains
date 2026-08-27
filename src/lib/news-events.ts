import type { FeedNewsItem } from "../../shared/types";

export interface NewsEventGroup {
  key: string;
  publishedAt: string;
  latestAt: string;
  representative: FeedNewsItem;
  items: FeedNewsItem[];
  sourceCount: number;
  itemCount: number;
  important: boolean;
}

interface MutableNewsEvent extends NewsEventGroup {
  itemIds: Set<string>;
  sources: Set<string>;
}

function hasControlOrFormatCharacter(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const point = value.codePointAt(index)!;
    if (point > 0xffff) index += 1;
    if (point <= 0x1f || (point >= 0x7f && point <= 0x9f)) return true;
    if (point === 0xad || point === 0x61c || point === 0x6dd || point === 0x70f || point === 0x8e2 || point === 0x180e || point === 0xfeff || point === 0x110bd || point === 0x110cd || point === 0xe0001) return true;
    if ((point >= 0x600 && point <= 0x605)
      || (point >= 0x890 && point <= 0x891)
      || (point >= 0x200b && point <= 0x200f)
      || (point >= 0x202a && point <= 0x202e)
      || (point >= 0x2060 && point <= 0x2064)
      || (point >= 0x2066 && point <= 0x206f)
      || (point >= 0xfff9 && point <= 0xfffb)
      || (point >= 0x13430 && point <= 0x1343f)
      || (point >= 0x1bca0 && point <= 0x1bca3)
      || (point >= 0x1d173 && point <= 0x1d17a)
      || (point >= 0xe0020 && point <= 0xe007f)) return true;
  }
  return false;
}

function eventKey(item: FeedNewsItem) {
  const value = (item as { eventId?: unknown }).eventId;
  return typeof value === "string"
    && value.length <= 200
    && value.trim() === value
    && value.length > 0
    && !hasControlOrFormatCharacter(value)
    ? `event:${value}`
    : `item:${item.id}`;
}

export function groupNewsEvents(items: FeedNewsItem[]): NewsEventGroup[] {
  const groups = new Map<string, MutableNewsEvent>();
  for (const item of items) {
    const key = eventKey(item);
    const current = groups.get(key);
    if (!current) {
      groups.set(key, {
        key,
        publishedAt: item.publishedAt,
        latestAt: item.publishedAt,
        representative: item,
        items: [item],
        sourceCount: 1,
        itemCount: 1,
        important: item.important,
        itemIds: new Set([item.id]),
        sources: new Set([item.source]),
      });
      continue;
    }
    if (current.itemIds.has(item.id)) continue;
    current.itemIds.add(item.id);
    current.sources.add(item.source);
    current.items.push(item);
    current.itemCount = current.itemIds.size;
    current.sourceCount = current.sources.size;
    current.important ||= item.important;
    if (item.publishedAt < current.publishedAt) current.publishedAt = item.publishedAt;
    if (item.publishedAt > current.latestAt) {
      current.latestAt = item.publishedAt;
      current.representative = item;
    }
  }

  return Array.from(groups.values(), ({ itemIds: _itemIds, sources: _sources, ...group }) => {
    group.items.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
    return group;
  }).sort((left, right) => right.latestAt.localeCompare(left.latestAt) || left.key.localeCompare(right.key));
}

const sourcePrefix = /^(?:(?:财联社(?:\s*\d{1,2}月\d{1,2}日电)?|华尔街见闻|金十数据|东方财富|新浪财经)\s*[:：,，|\-—]?\s*)/u;

function comparableText(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(sourcePrefix, "")
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

export function shouldShowNewsContent(title: unknown, content: unknown) {
  const normalizedTitle = comparableText(title);
  const normalizedContent = comparableText(content);
  if (!normalizedContent || normalizedContent === normalizedTitle) return false;
  if (!normalizedTitle || !normalizedContent.startsWith(normalizedTitle)) return true;
  const addition = normalizedContent.slice(normalizedTitle.length);
  return addition.length > 4 && !/^(?:详情|全文|以上|完|记者|编辑|来源)/u.test(addition);
}

export function safeNewsUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

export type NewsLinkAccess =
  | { kind: "article"; url: string }
  | { kind: "source-page"; url: string }
  | { kind: "missing" }
  | { kind: "invalid" };

function isKnownSourcePage(url: URL) {
  const host = url.hostname.toLocaleLowerCase("en-US").replace(/^www\./, "");
  const path = url.pathname.replace(/\/+$/, "") || "/";
  return (host === "finance.sina.com.cn" && path === "/7x24")
    || (host === "cls.cn" && path === "/telegraph");
}

export function newsLinkAccess(value: string | null | undefined): NewsLinkAccess {
  if (!value) return { kind: "missing" };
  const safeUrl = safeNewsUrl(value);
  if (!safeUrl) return { kind: "invalid" };
  return isKnownSourcePage(new URL(safeUrl))
    ? { kind: "source-page", url: safeUrl }
    : { kind: "article", url: safeUrl };
}

export function stableEventDomToken(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
