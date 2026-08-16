import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import type { AnalysisLink, AnalysisNode } from "../../shared/types";

type SimNode = AnalysisNode & d3.SimulationNodeDatum;
type SimLink = Omit<AnalysisLink, "source" | "target"> & d3.SimulationLinkDatum<SimNode> & {
  source: string | SimNode;
  target: string | SimNode;
};

interface StockNetworkProps {
  nodes: AnalysisNode[];
  links: AnalysisLink[];
  onPreview?: (node: AnalysisNode, anchor: { x: number; y: number }) => void;
  onPreviewEnd?: () => void;
}

interface ZoomControls {
  in: () => void;
  out: () => void;
  reset: () => void;
}

const relationshipLabels: Record<AnalysisLink["type"], string> = {
  "news-cooccurrence": "新闻共现",
  "stock-cooccurrence": "股票共现",
  "company-industry": "公司行业",
  "policy-impact": "政策影响",
  "supply-chain": "供应链事件",
};

const directionLabels: Record<AnalysisNode["direction"], string> = {
  positive: "偏正面",
  negative: "偏负面",
  mixed: "方向混合",
  neutral: "方向中性",
};

export function StockNetwork({ nodes, links, onPreview, onPreviewEnd }: StockNetworkProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const controlsRef = useRef<ZoomControls | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [selected, setSelected] = useState<AnalysisNode | null>(null);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setSelected(null);
  }, [nodes]);

  useEffect(() => {
    if (!svgRef.current || !size.width || !size.height || !nodes.length) return;
    const graphNodes: SimNode[] = nodes.map((node) => ({ ...node }));
    const graphLinks: SimLink[] = links.map((link) => ({ ...link }));
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${size.width} ${size.height}`);
    svg.append("title").text("快讯主题与关联股票网络");
    svg.append("desc").text("方形节点表示股票，圆形节点表示新闻主题；关系线区分新闻共现、股票共现、公司行业、政策影响和供应链事件。 ");
    const root = svg.append("g");
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.55, 2.5])
      .on("zoom", (event) => root.attr("transform", event.transform));
    svg.call(zoom);
    controlsRef.current = {
      in: () => svg.call(zoom.scaleBy, 1.25),
      out: () => svg.call(zoom.scaleBy, 0.8),
      reset: () => svg.call(zoom.transform, d3.zoomIdentity),
    };

    const linkSelection = root.append("g")
      .attr("class", "network-links")
      .selectAll("line")
      .data(graphLinks)
      .join("line")
      .attr("class", (link) => `network-link is-${link.type}`)
      .attr("stroke-width", (link) => Math.min(5, 0.7 + link.weight * 2.4 + Math.sqrt(link.cooccurrenceCount) * 0.35));
    linkSelection.append("title")
      .text((link) => `${relationshipLabels[link.type]} · 共同事件 ${link.cooccurrenceCount} · NPMI ${link.npmi.toFixed(2)} · ${link.confidence} confidence`);

    const nodeSelection = root.append("g")
      .attr("class", "network-nodes")
      .selectAll<SVGGElement, SimNode>("g")
      .data(graphNodes)
      .join("g")
      .attr("class", (node) => `network-node is-${node.type}`)
      .style("cursor", (node) => node.type === "stock" ? "pointer" : "grab")
      .on("mouseenter", (event, node) => {
        setSelected(node);
        if (node.type === "stock") onPreview?.(node, { x: event.clientX, y: event.clientY });
      })
      .on("mouseleave", (_event, node) => {
        if (node.type === "stock") onPreviewEnd?.();
      })
      .on("click", (event, node) => {
        setSelected(node);
        if (node.type === "stock") onPreview?.(node, { x: event.clientX, y: event.clientY });
      });

    nodeSelection.filter((node) => node.type === "stock")
      .append("rect")
      .attr("x", (node) => -Math.min(14, 7 + Math.sqrt(node.mentions) * 2))
      .attr("y", (node) => -Math.min(14, 7 + Math.sqrt(node.mentions) * 2))
      .attr("width", (node) => Math.min(28, 14 + Math.sqrt(node.mentions) * 4))
      .attr("height", (node) => Math.min(28, 14 + Math.sqrt(node.mentions) * 4))
      .attr("rx", 2);

    nodeSelection.filter((node) => node.type === "topic")
      .append("circle")
      .attr("r", (node) => Math.min(13, 5 + Math.sqrt(node.mentions) * 1.4));

    const labelSelection = nodeSelection.append("text")
      .attr("class", "network-label")
      .attr("x", (node) => node.type === "stock" ? 17 : 13)
      .attr("y", 4)
      .text((node) => node.label.length > 8 ? `${node.label.slice(0, 8)}…` : node.label);
    nodeSelection.append("title")
      .text((node) => `${node.type === "stock" ? "股票" : "主题"}：${node.label}${node.symbol ? ` (${node.symbol})` : ""} · ${node.mentions} 个事件 · ${directionLabels[node.direction]}${node.marketReaction?.status === "unavailable" ? " · 市场反应未验证" : ""}`);

    const simulation = d3.forceSimulation<SimNode>(graphNodes)
      .force("link", d3.forceLink<SimNode, SimLink>(graphLinks).id((node) => node.id).distance((link) => link.type === "stock-cooccurrence" ? 80 : 66).strength((link) => 0.25 + link.weight * 0.35))
      .force("charge", d3.forceManyBody<SimNode>().strength((node) => node.type === "stock" ? -190 : -105))
      .force("center", d3.forceCenter(size.width / 2, size.height / 2))
      .force("collision", d3.forceCollide<SimNode>().radius((node) => node.type === "stock" ? 32 : 25).iterations(2))
      .alphaDecay(0.045)
      .on("tick", () => {
        const padding = 20;
        graphNodes.forEach((node) => {
          node.x = Math.max(padding, Math.min(size.width - padding, node.x || size.width / 2));
          node.y = Math.max(padding, Math.min(size.height - padding, node.y || size.height / 2));
        });
        linkSelection
          .attr("x1", (link) => (link.source as SimNode).x || 0)
          .attr("y1", (link) => (link.source as SimNode).y || 0)
          .attr("x2", (link) => (link.target as SimNode).x || 0)
          .attr("y2", (link) => (link.target as SimNode).y || 0);
        nodeSelection.attr("transform", (node) => `translate(${node.x || 0},${node.y || 0})`);
        labelSelection
          .attr("x", (node) => (node.x || 0) > size.width - 86 ? (node.type === "stock" ? -17 : -13) : (node.type === "stock" ? 17 : 13))
          .attr("text-anchor", (node) => (node.x || 0) > size.width - 86 ? "end" : "start");
      });

    nodeSelection.call(d3.drag<SVGGElement, SimNode>()
      .on("start", (event, node) => {
        if (!event.active) simulation.alphaTarget(0.25).restart();
        node.fx = node.x;
        node.fy = node.y;
      })
      .on("drag", (event, node) => {
        node.fx = event.x;
        node.fy = event.y;
      })
      .on("end", (event, node) => {
        if (!event.active) simulation.alphaTarget(0);
        node.fx = null;
        node.fy = null;
      }));

    return () => {
      simulation.stop();
      controlsRef.current = null;
    };
  }, [links, nodes, onPreview, onPreviewEnd, size]);

  return (
    <div className="stock-network" ref={wrapRef}>
      <div className="network-controls" aria-label="关联图缩放控制">
        <button type="button" className="icon-button" onClick={() => controlsRef.current?.in()} title="放大" aria-label="放大"><ZoomIn size={16} /></button>
        <button type="button" className="icon-button" onClick={() => controlsRef.current?.out()} title="缩小" aria-label="缩小"><ZoomOut size={16} /></button>
        <button type="button" className="icon-button" onClick={() => controlsRef.current?.reset()} title="重置视图" aria-label="重置视图"><RotateCcw size={16} /></button>
      </div>
      <svg ref={svgRef} className="network-svg" role="img" aria-label="主题与股票关联图" />
      {!nodes.length ? <div className="analysis-empty">当前窗口尚无股票关联数据</div> : null}
      {selected ? (
        <div className="network-selection">
          <i className={`is-${selected.type}`} />
          <strong>{selected.label}</strong>
          {selected.symbol ? <span>{selected.symbol}</span> : null}
          <span>{selected.mentions} 个事件 · {directionLabels[selected.direction]}{selected.marketReaction?.status === "unavailable" ? " · 市场反应未验证" : ""}</span>
        </div>
      ) : null}
    </div>
  );
}
