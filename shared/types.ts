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
  sourceCount: number;
  rank: number;
  score: number;
  example: string;
}

export interface AnalysisNode {
  id: string;
  label: string;
  type: "topic" | "stock";
  mentions: number;
  sourceCount: number;
  symbol?: string;
}

export interface AnalysisLink {
  source: string;
  target: string;
  weight: number;
  type: "topic-stock" | "stock-stock";
}

export interface AnalysisWindow {
  hours: number;
  label: string;
  from: string;
  to: string;
  itemCount: number;
  eventCount: number;
  sourceCount: number;
  words: AnalysisWord[];
  nodes: AnalysisNode[];
  links: AnalysisLink[];
}

export interface AnalysisPayload {
  generatedAt: string;
  windows: AnalysisWindow[];
}

export interface MarketPoint {
  timestamp: string;
  price: number;
  average: number | null;
  volume: number | null;
  change: number;
  changePercent: number;
}

export interface MarketSnapshot {
  symbol: "000300";
  name: "沪深300";
  previousClose: number;
  points: MarketPoint[];
  delayed: boolean;
  updatedAt: string;
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
  | { type: "heartbeat"; data: { serverTime: string } };
