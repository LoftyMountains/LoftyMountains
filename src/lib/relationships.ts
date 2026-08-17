import type { AnalysisLink } from "../../shared/types";

export const relationshipLabels: Record<AnalysisLink["type"], string> = {
  "news-cooccurrence": "新闻共现",
  "stock-cooccurrence": "股票共现",
  "company-industry": "公司行业",
  "policy-impact": "政策影响",
  "supply-chain": "供应链事件",
};

export const confidenceLabels: Record<AnalysisLink["confidence"], string> = {
  high: "高置信",
  medium: "中置信",
  low: "低置信",
};

export const confidenceRank: Record<AnalysisLink["confidence"], number> = {
  low: 1,
  medium: 2,
  high: 3,
};

export const sourceLabels = {
  cls: "财联社",
  wallstreetcn: "华尔街见闻",
  jin10: "金十数据",
  eastmoney: "东方财富",
  sina: "新浪财经",
} as const;
