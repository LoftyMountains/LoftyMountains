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
  status: "verified" | "unavailable";
  reason?: string;
  sampleSize: number;
  excessReturn5m: number | null;
  excessReturn30m: number | null;
  excessReturn1d: number | null;
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
  marketReaction?: AnalysisMarketReaction;
}

export type AnalysisRelationshipType = "news-cooccurrence" | "stock-cooccurrence" | "company-industry" | "policy-impact" | "supply-chain";

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

export interface MarketPoint {
  timestamp: string;
  price: number;
  average: number | null;
  volume: number | null;
  change: number;
  changePercent: number;
}

export type MarketSourceId = "tencent" | "sina";

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
  news: NewsItem[];
  market: MarketSnapshot;
  sources: SourceStatus[];
}

export interface ReplayPayload {
  from: string;
  to: string;
  news: NewsItem[];
  market: MarketSnapshot;
}

export type StreamEvent =
  | { type: "news"; data: NewsItem[] }
  | { type: "market"; data: MarketSnapshot }
  | { type: "sources"; data: SourceStatus[] }
  | { type: "analysis"; data: { generatedAt: string; windows: number[] } }
  | { type: "heartbeat"; data: { serverTime: string } };
