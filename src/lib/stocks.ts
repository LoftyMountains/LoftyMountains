import type { AnalysisNode } from "../../shared/types";

export function stockMarketLabel(symbol?: string) {
  const normalized = symbol?.trim().toUpperCase() || "";
  if (/^\d{6}\.(?:SH|SZ|BJ)$/.test(normalized)) return "A股";
  if (/^\d{1,5}\.HK$/.test(normalized)) return "港股";
  if (/^[A-Z][A-Z0-9.-]{0,9}\.US$/.test(normalized)) return "美股";
  return null;
}

export function analysisNodeLabel(node: AnalysisNode) {
  if (node.type !== "stock") return node.label;
  const market = stockMarketLabel(node.symbol);
  return market ? `${node.label} · ${market}` : node.label;
}

export function compactAnalysisNodeLabel(node: AnalysisNode) {
  const market = node.type === "stock" ? stockMarketLabel(node.symbol) : null;
  const maximumNameLength = market ? 6 : 8;
  const name = node.label.length > maximumNameLength
    ? `${node.label.slice(0, maximumNameLength)}…`
    : node.label;
  return market ? `${name}·${market}` : name;
}
