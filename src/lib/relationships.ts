import type { AnalysisLink } from "../../shared/types";

export const relationshipLabels: Record<AnalysisLink["type"], string> = {
  "news-cooccurrence": "新闻共现",
  "stock-cooccurrence": "股票共现",
  "company-industry": "公司行业",
  "theme-membership": "主题关联",
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
  fed: "美联储",
  ecb: "欧洲央行",
  nbs: "国家统计局",
  bea: "美国经济分析局",
  boe: "英格兰银行",
  bbc: "BBC 商业",
  gdacs: "GDACS 灾害预警",
  nhc: "NOAA 飓风中心",
  eonet: "NASA 地球观测",
  panama: "巴拿马运河管理局",
  eurocontrol: "欧洲航空管制",
  "who-don": "WHO 疾病暴发通报",
  "cdc-travel": "CDC 旅行健康告警",
  cls: "财联社",
  wallstreetcn: "华尔街见闻",
  jin10: "金十数据",
  eastmoney: "东方财富",
  sina: "新浪财经",
} as const;
