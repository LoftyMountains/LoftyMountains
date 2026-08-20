import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import type { AnalysisLink, AnalysisNode } from "../../shared/types";
import { confidenceLabels, relationshipLabels, sourceLabels } from "../lib/relationships";
import { formatFull } from "../lib/time";

type SimNode = AnalysisNode & d3.SimulationNodeDatum;
type SimLink = Omit<AnalysisLink, "source" | "target"> & d3.SimulationLinkDatum<SimNode> & {
  source: string | SimNode;
  target: string | SimNode;
};

interface StockNetworkProps {
  nodes: AnalysisNode[];
  links: AnalysisLink[];
  emptyMessage?: string;
  onPreview?: (node: AnalysisNode, anchor: { x: number; y: number }) => void;
  onTogglePreview?: (node: AnalysisNode, anchor: { x: number; y: number }) => void;
  onPreviewEnd?: () => void;
}

interface ZoomControls {
  in: () => void;
  out: () => void;
  reset: () => void;
}

interface LinkPreview {
  link: AnalysisLink;
  x: number;
  y: number;
}

interface NetworkPosition {
  x: number;
  y: number;
}

const NETWORK_PADDING = 24;
const NETWORK_CONTROLS_WIDTH = 132;
const NETWORK_CONTROLS_BOTTOM = 62;
const NETWORK_SELECTION_HEIGHT = 62;
const NETWORK_SETTLE_TICKS = 180;

const directionLabels: Record<AnalysisNode["direction"], string> = {
  positive: "偏正面",
  negative: "偏负面",
  mixed: "方向混合",
  neutral: "方向中性",
};

function signedPercent(value: number | null) {
  if (value == null) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function reactionLabel(node: AnalysisNode) {
  const reaction = node.marketReaction;
  if (!reaction) return "";
  if (reaction.status === "unavailable") return `市场反应未验证：${reaction.reason || "行情不足"}`;
  const samples = reaction.sampleSizes
    ? `样本 5分钟 ${reaction.sampleSizes.excessReturn5m} / 30分钟 ${reaction.sampleSizes.excessReturn30m} / 下一交易日 ${reaction.sampleSizes.excessReturn1d}`
    : `${reaction.sampleSize} 个样本`;
  const availability = reaction.availableFrom && reaction.availableTo
    ? ` · 行情覆盖 ${formatFull(reaction.availableFrom)} 至 ${formatFull(reaction.availableTo)}`
    : "";
  const benchmark = reaction.benchmark
    ? ` · 基准 ${reaction.benchmark.name} (${reaction.benchmark.symbol})`
    : "";
  const confidence = reaction.status === "insufficient"
    ? `市场反应观察（未达验证门槛${reaction.reason ? `：${reaction.reason}` : ""}）`
    : "市场反应已验证";
  return `${confidence} · 超额收益 5分钟 ${signedPercent(reaction.excessReturn5m)} · 30分钟 ${signedPercent(reaction.excessReturn30m)} · 下一交易日 ${signedPercent(reaction.excessReturn1d)} · ${samples}${benchmark}${availability}`;
}

function nodeId(value: string | SimNode) {
  return typeof value === "string" ? value : value.id;
}

function analysisLink(link: SimLink): AnalysisLink {
  return {
    source: nodeId(link.source),
    target: nodeId(link.target),
    type: link.type,
    cooccurrenceCount: link.cooccurrenceCount,
    npmi: link.npmi,
    confidence: link.confidence,
    weight: link.weight,
    evidence: link.evidence || [],
  };
}

function constrainPosition(width: number, height: number, x: number, y: number): NetworkPosition {
  const maxX = Math.max(NETWORK_PADDING, width - NETWORK_PADDING);
  const maxY = Math.max(NETWORK_PADDING, height - NETWORK_SELECTION_HEIGHT);
  const constrained = {
    x: Math.max(NETWORK_PADDING, Math.min(maxX, x)),
    y: Math.max(NETWORK_PADDING, Math.min(maxY, y)),
  };
  const controlsLeft = Math.max(NETWORK_PADDING, width - NETWORK_CONTROLS_WIDTH);
  if (constrained.x > controlsLeft && constrained.y < NETWORK_CONTROLS_BOTTOM) {
    constrained.y = Math.min(maxY, NETWORK_CONTROLS_BOTTOM);
  }
  return constrained;
}

export function StockNetwork({ nodes, links, emptyMessage = "当前窗口关系证据不足", onPreview, onTogglePreview, onPreviewEnd }: StockNetworkProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const controlsRef = useRef<ZoomControls | null>(null);
  const pinnedLinkRef = useRef<string | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [selected, setSelected] = useState<AnalysisNode | null>(null);
  const [linkPreview, setLinkPreview] = useState<LinkPreview | null>(null);

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
    setLinkPreview(null);
  }, [links, nodes]);

  useEffect(() => {
    if (!svgRef.current || !size.width || !size.height) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    controlsRef.current = null;
    if (!nodes.length || !links.length) return;
    const graphNodes: SimNode[] = nodes.map((node) => ({ ...node }));
    const graphLinks: SimLink[] = links.map((link) => ({ ...link }));
    pinnedLinkRef.current = null;
    svg.attr("viewBox", `0 0 ${size.width} ${size.height}`);
    svg.attr("data-layout-state", "settling");
    svg.append("title").text("快讯主题与关联股票网络");
    svg.append("desc").text("方形节点表示股票，圆形节点表示新闻主题；关系线区分新闻共现、股票共现、公司行业、政策影响和供应链事件。 ");
    const root = svg.append("g");
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.55, 2.5])
      .filter((event) => !coarsePointer || event.type === "wheel")
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
      .text((link) => `${relationshipLabels[link.type]} · 共同事件 ${link.cooccurrenceCount} · NPMI ${link.npmi.toFixed(2)} · ${confidenceLabels[link.confidence]}`);

    const clearLinkPreview = () => {
      pinnedLinkRef.current = null;
      linkSelection.classed("is-active", false);
      setLinkPreview(null);
    };
    const showLinkPreview = (event: MouseEvent | FocusEvent, link: SimLink, pin = false) => {
      const linkKey = `${link.type}:${nodeId(link.source)}:${nodeId(link.target)}`;
      if (pin && pinnedLinkRef.current === linkKey) {
        clearLinkPreview();
        return;
      }
      if (!pin && pinnedLinkRef.current) return;
      const bounds = wrapRef.current?.getBoundingClientRect();
      const targetBounds = (event.currentTarget as SVGLineElement).getBoundingClientRect();
      if (!bounds) return;
      const mouseEvent = event as MouseEvent;
      const x = Number.isFinite(mouseEvent.clientX) && mouseEvent.clientX > 0
        ? mouseEvent.clientX - bounds.left
        : targetBounds.left + targetBounds.width / 2 - bounds.left;
      const y = Number.isFinite(mouseEvent.clientY) && mouseEvent.clientY > 0
        ? mouseEvent.clientY - bounds.top
        : targetBounds.top + targetBounds.height / 2 - bounds.top;
      if (pin) pinnedLinkRef.current = linkKey;
      linkSelection.classed("is-active", (candidate) => candidate === link);
      setLinkPreview({ link: analysisLink(link), x, y });
    };
    const hideLinkPreview = () => {
      if (pinnedLinkRef.current) return;
      linkSelection.classed("is-active", false);
      setLinkPreview(null);
    };
    const linkHitSelection = root.append("g")
      .attr("class", "network-link-hits")
      .selectAll("line")
      .data(graphLinks)
      .join("line")
      .attr("stroke", "transparent")
      .attr("stroke-width", (link) => Math.max(12, 4 + link.weight * 6))
      .attr("tabindex", 0)
      .attr("role", "button")
      .attr("aria-label", (link) => `${relationshipLabels[link.type]}，共同事件 ${link.cooccurrenceCount}，NPMI ${link.npmi.toFixed(2)}，${confidenceLabels[link.confidence]}`)
      .style("pointer-events", "stroke")
      .style("cursor", "help")
      .on("mouseenter", showLinkPreview)
      .on("mousemove", showLinkPreview)
      .on("mouseleave", hideLinkPreview)
      .on("focus", showLinkPreview)
      .on("blur", hideLinkPreview)
      .on("click", (event, link) => {
        event.stopPropagation();
        showLinkPreview(event, link, true);
      })
      .on("keydown", (event, link) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        showLinkPreview(event, link, true);
      });
    svg.on("click", clearLinkPreview);

    const nodeSelection = root.append("g")
      .attr("class", "network-nodes")
      .selectAll<SVGGElement, SimNode>("g")
      .data(graphNodes)
      .join("g")
      .attr("class", (node) => `network-node is-${node.type}`)
      .attr("tabindex", 0)
      .attr("role", "button")
      .attr("aria-label", (node) => `${node.type === "stock" ? "股票" : "主题"} ${node.label}，${node.mentions} 个事件，${directionLabels[node.direction]}`)
      .style("cursor", (node) => node.type === "stock" ? "pointer" : "grab")
      .on("mouseenter", (event, node) => {
        setSelected(node);
        if (node.type === "stock") onPreview?.(node, { x: event.clientX, y: event.clientY });
      })
      .on("mouseleave", (_event, node) => {
        if (node.type === "stock") onPreviewEnd?.();
      })
      .on("focus", (event, node) => {
        setSelected(node);
        if (node.type !== "stock") return;
        const bounds = (event.currentTarget as SVGGElement).getBoundingClientRect();
        onPreview?.(node, { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
      })
      .on("blur", (_event, node) => {
        if (node.type === "stock") onPreviewEnd?.();
      })
      .on("click", (event, node) => {
        event.stopPropagation();
        setSelected(node);
        if (node.type === "stock") onTogglePreview?.(node, { x: event.clientX, y: event.clientY });
      })
      .on("keydown", (event, node) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        setSelected(node);
        if (node.type !== "stock") return;
        const bounds = (event.currentTarget as SVGGElement).getBoundingClientRect();
        onTogglePreview?.(node, { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
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
      .text((node) => `${node.type === "stock" ? "股票" : "主题"}：${node.label}${node.symbol ? ` (${node.symbol})` : ""} · ${node.mentions} 个事件 · ${directionLabels[node.direction]}${node.marketReaction ? ` · ${reactionLabel(node)}` : ""}`);

    const renderGraph = () => {
      graphNodes.forEach((node) => {
        const position = constrainPosition(
          size.width,
          size.height,
          node.x ?? size.width / 2,
          node.y ?? size.height / 2,
        );
        node.x = position.x;
        node.y = position.y;
      });
      linkSelection
        .attr("x1", (link) => (link.source as SimNode).x || 0)
        .attr("y1", (link) => (link.source as SimNode).y || 0)
        .attr("x2", (link) => (link.target as SimNode).x || 0)
        .attr("y2", (link) => (link.target as SimNode).y || 0);
      linkHitSelection
        .attr("x1", (link) => (link.source as SimNode).x || 0)
        .attr("y1", (link) => (link.source as SimNode).y || 0)
        .attr("x2", (link) => (link.target as SimNode).x || 0)
        .attr("y2", (link) => (link.target as SimNode).y || 0);
      nodeSelection.attr("transform", (node) => `translate(${node.x || 0},${node.y || 0})`);
      labelSelection
        .attr("x", (node) => (node.x || 0) > size.width - 86 ? (node.type === "stock" ? -17 : -13) : (node.type === "stock" ? 17 : 13))
        .attr("text-anchor", (node) => (node.x || 0) > size.width - 86 ? "end" : "start");
    };

    const simulation = d3.forceSimulation<SimNode>(graphNodes)
      .force("link", d3.forceLink<SimNode, SimLink>(graphLinks).id((node) => node.id).distance((link) => link.type === "stock-cooccurrence" ? 80 : 66).strength((link) => 0.25 + link.weight * 0.35))
      .force("charge", d3.forceManyBody<SimNode>().strength((node) => node.type === "stock" ? -190 : -105))
      .force("center", d3.forceCenter(size.width / 2, size.height / 2))
      .force("collision", d3.forceCollide<SimNode>().radius((node) => node.type === "stock" ? 32 : 25).iterations(2))
      .alphaDecay(0.045)
      .on("tick", renderGraph)
      .stop();

    for (let tick = 0; tick < NETWORK_SETTLE_TICKS; tick += 1) {
      simulation.tick();
      graphNodes.forEach((node) => {
        const position = constrainPosition(
          size.width,
          size.height,
          node.x ?? size.width / 2,
          node.y ?? size.height / 2,
        );
        node.x = position.x;
        node.y = position.y;
      });
    }
    renderGraph();
    svg.attr("data-layout-state", "settled");

    if (!coarsePointer) {
      nodeSelection.call(d3.drag<SVGGElement, SimNode>()
        .on("start", (event, node) => {
          if (!event.active) simulation.alphaTarget(0.25).restart();
          node.fx = node.x;
          node.fy = node.y;
        })
        .on("drag", (event, node) => {
          const position = constrainPosition(size.width, size.height, event.x, event.y);
          node.fx = position.x;
          node.fy = position.y;
        })
        .on("end", (event, node) => {
          if (!event.active) simulation.alphaTarget(0);
          node.fx = node.x;
          node.fy = node.y;
          simulation.stop();
          renderGraph();
        }));
    }

    return () => {
      simulation.stop();
      svg.on("click", null);
      pinnedLinkRef.current = null;
      controlsRef.current = null;
    };
  }, [links, nodes, onPreview, onPreviewEnd, onTogglePreview, size]);

  return (
    <div className="stock-network" ref={wrapRef}>
      <div className="network-controls" aria-label="关联图缩放控制">
        <button type="button" className="icon-button" onClick={() => controlsRef.current?.in()} title="放大" aria-label="放大"><ZoomIn size={16} /></button>
        <button type="button" className="icon-button" onClick={() => controlsRef.current?.out()} title="缩小" aria-label="缩小"><ZoomOut size={16} /></button>
        <button type="button" className="icon-button" onClick={() => controlsRef.current?.reset()} title="重置视图" aria-label="重置视图"><RotateCcw size={16} /></button>
      </div>
      <svg ref={svgRef} className="network-svg" role="img" aria-label="主题与股票关联图" />
      {!links.length ? <div className="analysis-empty">{emptyMessage}</div> : null}
      {linkPreview ? (
        <div
          className="network-link-preview"
          style={{
            left: Math.max(10, Math.min(linkPreview.x + 12, Math.max(10, size.width - 340))),
            top: Math.max(10, Math.min(linkPreview.y + 12, Math.max(10, size.height - 260))),
          }}
        >
          <header>
            <strong>{relationshipLabels[linkPreview.link.type]}</strong>
            <span>{confidenceLabels[linkPreview.link.confidence]}</span>
          </header>
          <p>{nodes.find((node) => node.id === linkPreview.link.source)?.label || linkPreview.link.source} ↔ {nodes.find((node) => node.id === linkPreview.link.target)?.label || linkPreview.link.target}</p>
          <div><span>共同事件 {linkPreview.link.cooccurrenceCount}</span><span>NPMI {linkPreview.link.npmi.toFixed(2)}</span></div>
          <ul>
            {!linkPreview.link.evidence.length ? <li className="is-empty">证据标题暂不可用</li> : null}
            {linkPreview.link.evidence.map((evidence) => (
              <li key={evidence.eventId}>
                <time dateTime={evidence.publishedAt}>{formatFull(evidence.publishedAt)}</time>
                <span>{evidence.title}</span>
                <small>{evidence.sources.map((source) => sourceLabels[source]).join(" · ")}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {selected ? (
        <div className="network-selection">
          <i className={`is-${selected.type}`} />
          <strong>{selected.label}</strong>
          {selected.symbol ? <span>{selected.symbol}</span> : null}
          <span title={reactionLabel(selected)}>{selected.mentions} 个事件 · {directionLabels[selected.direction]}{selected.marketReaction ? ` · ${reactionLabel(selected)}` : ""}</span>
        </div>
      ) : null}
    </div>
  );
}
