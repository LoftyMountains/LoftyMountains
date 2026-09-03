export type SourceId = "cls" | "wallstreetcn" | "jin10" | "eastmoney" | "sina";

export interface RelatedStock {
  symbol: string;
  name: string;
}

export interface NewsItem {
  id: string;
  externalId: string;
  source: SourceId;
  sourceLabel: string;
  title: string;
  content: string;
  publishedAt: string;
  url: string | null;
  important: boolean;
  tags: string[];
  relatedStocks?: RelatedStock[];
}

export interface FeedNewsItem extends NewsItem {
  eventId: string | null;
}

export const NEWS_QUERY_MAX_LIMIT = 1_000;

export interface NewsQueryResultMetadata {
  returnedCount: number;
  limit: number;
  truncated: boolean;
}

export interface NewsQueryResponse {
  items: FeedNewsItem[];
  result: NewsQueryResultMetadata;
}

export interface AnalysisWord {
  text: string;
  count: number;
  baselineCount: number;
  sourceCount: number;
  sourceDiversity: number;
  rank: number;
  score: number;
  burst: number;
  direction: "positive" | "negative" | "mixed" | "neutral";
  directionScore: number;
  example: string;
}

export interface AnalysisMarketReaction {
  status: "verified" | "insufficient" | "unavailable";
  reason?: string;
  sampleSize: number;
  sampleSizes?: {
    excessReturn5m: number;
    excessReturn30m: number;
    excessReturn1d: number;
  };
  availableFrom?: string | null;
  availableTo?: string | null;
  benchmark?: {
    market: "cn" | "hk" | "us";
    symbol: string;
    name: string;
  };
  excessReturn5m: number | null;
  excessReturn30m: number | null;
  excessReturn1d: number | null;
}

export interface AnalysisPeriodChange {
  status: "available" | "unavailable";
  reason?: string;
  changePercent: number | null;
  from: string | null;
  to: string | null;
}

export interface AnalysisDailyPoint {
  date: string;
  open?: number;
  high?: number;
  low?: number;
  close: number;
}

export interface AnalysisDailySeries {
  symbol: string;
  provider: string;
  generatedAt: string;
  points: AnalysisDailyPoint[];
}

export interface AnalysisNode {
  id: string;
  label: string;
  type: "topic" | "stock";
  mentions: number;
  sourceCount: number;
  symbol?: string;
  direction: "positive" | "negative" | "mixed" | "neutral";
  directionScore: number;
  periodChange?: AnalysisPeriodChange;
  dailyPrices?: AnalysisDailyPoint[];
  marketReaction?: AnalysisMarketReaction;
}

export type AnalysisRelationshipType = "news-cooccurrence" | "stock-cooccurrence" | "company-industry" | "theme-membership" | "policy-impact" | "supply-chain";

export interface AnalysisLinkEvidence {
  eventId: string;
  title: string;
  publishedAt: string;
  sources: SourceId[];
}

export interface AnalysisLink {
  source: string;
  target: string;
  weight: number;
  cooccurrenceCount: number;
  npmi: number;
  confidence: "low" | "medium" | "high";
  type: AnalysisRelationshipType;
  evidence: AnalysisLinkEvidence[];
}

export interface AnalysisWindowMetrics {
  calculatedAt: string;
  calculationMs: number;
  fullCalculationMs: number;
  responseBytes: number;
  nodeCount: number;
  reused: boolean;
}

export interface AnalysisWindow {
  hours: number;
  label: string;
  from: string;
  to: string;
  actualFrom: string | null;
  actualTo: string | null;
  coverageRatio: number | null;
  complete: boolean | null;
  itemCount: number;
  eventCount: number;
  baselineEventCount: number;
  sourceCount: number;
  words: AnalysisWord[];
  nodes: AnalysisNode[];
  links: AnalysisLink[];
  metrics?: AnalysisWindowMetrics;
}

export interface AnalysisWindowSummary {
  hours: number;
  label: string;
  actualFrom: string | null;
  actualTo: string | null;
  coverageRatio: number | null;
  complete: boolean | null;
  eventCount: number;
  topTopic: string | null;
}

export interface AnalysisPayload {
  generatedAt: string;
  latestEventAt: string | null;
  summaries: AnalysisWindowSummary[];
  windows: AnalysisWindow[];
  metrics?: {
    calculationMs: number;
    responseBytes: number;
    reusedWindows: number;
  };
}

export type IndustryLeaderMarket = "cn" | "hk" | "us";

export interface IndustryLeaderQuote {
  status: "available" | "unavailable";
  tradingState: "trading" | "closed" | "unknown";
  realtime: boolean;
  price: number | null;
  previousClose: number | null;
  changePercent: number | null;
  marketCap: number | null;
  currency: "CNY" | "HKD" | "USD" | null;
  marketCapCurrency: "CNY" | "HKD" | "USD" | null;
  provider: string;
  updatedAt: string | null;
  reason?: string | null;
}

export interface IndustryLeaderLiveQuotesPayload {
  generatedAt: string;
  pollAfterMs: number;
  quotes: Record<string, IndustryLeaderQuote>;
}

export interface IndustryLeaderStock {
  symbol: string;
  name: string;
  market: IndustryLeaderMarket;
  exchange: "A股" | "港股" | "NASDAQ" | "NYSE" | "AMEX" | "美股";
  mentions: number;
  business: string;
  businessSource: "curated-product-catalog" | "public-product-segments" | "public-company-profile" | "standard-sub-industry";
  quote: IndustryLeaderQuote;
}

export interface IndustryCatalogEntry {
  id: string;
  label: string;
  taxonomy: "跨市场标准子行业";
  sectorId: string;
  sectorLabel: string;
  eventCount: number;
  marketCount: number;
  stockCount: number;
}

export interface MarketUniverseCoverage {
  source: string;
  refreshedAt: string;
  stale: boolean;
  fallback: boolean;
  listedCount: Record<IndustryLeaderMarket | "total", number>;
  eligibleCount: Record<IndustryLeaderMarket | "total", number>;
  criteria: {
    primaryListingOnly: true;
    activeOnly: true;
    commonStockOnly: true;
    liquidityWindow: "30d-average-traded-value";
    minMarketCapUsd: Record<IndustryLeaderMarket, number>;
    minTradedValueUsd: Record<IndustryLeaderMarket, number>;
  };
}

export interface IndustryLeadersPayload {
  generatedAt: string;
  from: string;
  to: string;
  selectedSubIndustry: string | null;
  selectedSubIndustryLabel: string | null;
  catalog: IndustryCatalogEntry[];
  leaders: Record<IndustryLeaderMarket, IndustryLeaderStock[]>;
  provider: string;
  universe: MarketUniverseCoverage;
}

export interface MarketPoint {
  timestamp: string;
  price: number;
  average: number | null;
  volume: number | null;
  change: number;
  changePercent: number;
}

export type MarketSourceId = "licensed" | "tencent" | "sina";

export interface MarketSnapshot {
  symbol: "000300";
  name: "沪深300";
  previousClose: number;
  points: MarketPoint[];
  delayed: boolean;
  updatedAt: string;
  source: MarketSourceId | null;
  sourceLabel: string | null;
  lastSuccessAt: string | null;
  latencyMs: number | null;
  switchReason: string | null;
  fallbackActive: boolean;
}

export interface SourceStatus {
  id: SourceId;
  label: string;
  state: "live" | "delayed" | "offline" | "polling";
  itemCount: number;
  lastSuccessAt: string | null;
  latencyMs: number | null;
  message: string | null;
}

export interface RuntimeInfo {
  region: string;
  cpuCores: number;
  memoryMb: number;
  storageFreeMb: number;
  databaseLimitMb: number;
  pollSeconds: number;
  marketPollSeconds: number;
  aggregationConcurrency: number;
  retentionDays: number;
  serverTime: string;
  timezone: string;
  gitCommit: string;
  buildTime: string | null;
  startedAt: string;
}

export interface BootstrapPayload {
  news: FeedNewsItem[];
  market: MarketSnapshot;
  sources: SourceStatus[];
}

export interface ReplayPayload {
  from: string;
  to: string;
  news: FeedNewsItem[];
  market: MarketSnapshot;
}

export type StreamEvent =
  | { type: "news"; data: FeedNewsItem[] }
  | { type: "market"; data: MarketSnapshot }
  | { type: "sources"; data: SourceStatus[] }
  | { type: "analysis"; data: { generatedAt: string; windows: number[] } }
  | { type: "heartbeat"; data: { serverTime: string } };
