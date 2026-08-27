import { useEffect, useRef, useState, type CSSProperties } from "react";
import * as d3 from "d3";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import type { AnalysisLink, AnalysisNode } from "../../shared/types";
import { confidenceLabels, relationshipLabels, sourceLabels } from "../lib/relationships";
import { analysisNodeLabel, compactAnalysisNodeLabel } from "../lib/stocks";
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
  highlightedNodeId?: string | null;
  onClearSelection?: () => void;
  totalNodeCount?: number;
  expanded?: boolean;
  onToggleScope?: () => void;
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
const NETWORK_NODE_RADIUS = 18;
const NETWORK_LABEL_MAX_WIDTH = 86;
const NETWORK_SELECTION_HEIGHT = 82;
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

function periodChangeClass(node: AnalysisNode) {
  if (node.type !== "stock" || node.periodChange?.status !== "available" || node.periodChange.changePercent == null) {
    return node.type === "stock" ? "price-unavailable" : "";
  }
  if (node.periodChange.changePercent > 0) return "price-up";
  if (node.periodChange.changePercent < 0) return "price-down";
  return "price-flat";
}

function periodChangeStrength(node: AnalysisNode) {
  const change = node.periodChange?.status === "available" ? node.periodChange.changePercent : null;
  return change == null ? 0 : Math.round(24 + Math.min(1, Math.abs(change) / 10) * 68);
}

function periodChangeStyle(node: AnalysisNode) {
  return { "--price-strength": `${periodChangeStrength(node)}%` } as CSSProperties;
}

function periodChangeLabel(node: AnalysisNode, detailed = false) {
  const change = node.periodChange;
  if (change?.status !== "available" || change.changePercent == null) {
    return detailed && change?.reason ? `周期涨跌不可用：${change.reason}` : "周期涨跌 --";
  }
  const range = detailed && change.from && change.to
    ? ` · 行情区间 ${formatFull(change.from)} 至 ${formatFull(change.to)}`
    : "";
  return `周期涨跌 ${signedPercent(change.changePercent)}${range}`;
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

function valueTone(value: number | null) {
  if (value == null || Math.abs(value) < .05) return "neutral";
  return value > 0 ? "positive" : "negative";
}

function marketValidation(node: AnalysisNode) {
  const reaction = node.marketReaction;
  if (!reaction) return null;
  if (reaction.status === "unavailable") {
    return {
      status: "未验证",
      tone: "unavailable",
      headline: reaction.reason || "行情数据不足",
      metrics: [] as Array<{ label: string; value: number | null }>,
      context: "等待有效行情样本",
    };
  }
  const metrics = [
    { label: "5 分钟", value: reaction.excessReturn5m, sampleSize: reaction.sampleSizes?.excessReturn5m ?? reaction.sampleSize },
    { label: "30 分钟", value: reaction.excessReturn30m, sampleSize: reaction.sampleSizes?.excessReturn30m ?? reaction.sampleSize },
    { label: "次日", value: reaction.excessReturn1d, sampleSize: reaction.sampleSizes?.excessReturn1d ?? reaction.sampleSize },
  ];
  const primary = [...metrics].reverse().find((metric) => metric.value != null) || null;
  const benchmark = reaction.benchmark?.name || "市场基准";
  const primaryTone = valueTone(primary?.value ?? null);
  const relative = primaryTone === "positive" ? "跑赢" : primaryTone === "negative" ? "跑输" : "基本同步";
  const headline = primary
    ? `${primary.label}${relative}${benchmark} ${signedPercent(primary.value)}`
    : reaction.reason || "暂未形成有效收益结论";
  return {
    status: reaction.status === "verified" ? "已验证" : "样本观察",
    tone: reaction.status === "verified" ? primaryTone : "watch",
    headline,
    metrics,
    context: `${primary?.label || "有效"}样本 ${primary?.sampleSize ?? reaction.sampleSize}${reaction.benchmark ? ` · 基准 ${reaction.benchmark.name}` : ""}`,
  };
}

function nodeId(value: string | SimNode) {
  return typeof value === "string" ? value : value.id;
}

function nodeLabel(nodes: AnalysisNode[], id: string) {
  const node = nodes.find((candidate) => candidate.id === id);
  return node ? analysisNodeLabel(node) : id;
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
  if (constrained.x > controlsLeft - NETWORK_NODE_RADIUS
    && constrained.y < NETWORK_CONTROLS_BOTTOM + NETWORK_NODE_RADIUS) {
    constrained.y = Math.min(maxY, NETWORK_CONTROLS_BOTTOM + NETWORK_NODE_RADIUS);
  }
  return constrained;
}

export function StockNetwork({ nodes, links, emptyMessage = "当前窗口关系证据不足", onPreview, onTogglePreview, onPreviewEnd, highlightedNodeId = null, onClearSelection, totalNodeCount = nodes.length, expanded = false, onToggleScope }: StockNetworkProps) {
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
    svg.append("desc").text("方形节点表示股票，圆形节点表示新闻主题；关系线区分新闻共现、股票共现、公司行业、主题关联、政策影响和供应链事件。 ");
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
      .attr("class", (link) => `network-link is-${link.type} confidence-${link.confidence}`)
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
      .attr("aria-hidden", "true")
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
    svg.on("click", () => {
      clearLinkPreview();
      onClearSelection?.();
    });

    const activateNode = (node: SimNode) => {
      root.selectAll<SVGGElement, SimNode>(".network-node")
        .classed("is-active", (candidate) => candidate.id === node.id);
      linkSelection.classed("is-related", (link) => nodeId(link.source) === node.id || nodeId(link.target) === node.id);
    };

    const nodeSelection = root.append("g")
      .attr("class", "network-nodes")
      .selectAll<SVGGElement, SimNode>("g")
      .data(graphNodes)
      .join("g")
      .attr("class", (node) => `network-node is-${node.type} direction-${node.direction} ${periodChangeClass(node)}`)
      .attr("tabindex", (_node, index) => index === 0 ? 0 : -1)
      .attr("role", "button")
      .attr("aria-label", (node) => `${node.type === "stock" ? "股票" : "主题"} ${analysisNodeLabel(node)}，${node.type === "stock" ? `${periodChangeLabel(node)}，` : ""}${node.mentions} 个事件，舆情${directionLabels[node.direction]}`)
      .style("--price-strength", (node) => `${periodChangeStrength(node)}%`)
      .style("cursor", (node) => node.type === "stock" ? "pointer" : "grab")
      .on("mouseenter", (event, node) => {
        activateNode(node);
        setSelected(node);
        onPreview?.(node, { x: event.clientX, y: event.clientY });
      })
      .on("mouseleave", () => onPreviewEnd?.())
      .on("focus", (event, node) => {
        activateNode(node);
        setSelected(node);
        const bounds = (event.currentTarget as SVGGElement).getBoundingClientRect();
        onPreview?.(node, { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
      })
      .on("blur", () => onPreviewEnd?.())
      .on("click", (event, node) => {
        event.stopPropagation();
        setSelected(node);
        onTogglePreview?.(node, { x: event.clientX, y: event.clientY });
      })
      .on("keydown", (event, node) => {
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
          event.preventDefault();
          const elements = nodeSelection.nodes();
          const current = elements.indexOf(event.currentTarget as SVGGElement);
          const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
          const next = elements[(current + direction + elements.length) % elements.length];
          elements.forEach((element) => element.setAttribute("tabindex", element === next ? "0" : "-1"));
          next?.focus();
          return;
        }
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        setSelected(node);
        const bounds = (event.currentTarget as SVGGElement).getBoundingClientRect();
        onTogglePreview?.(node, { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
      });

    nodeSelection.filter((node) => node.type === "stock")
      .append("rect")
      .attr("class", "network-node-core")
      .attr("x", (node) => -Math.min(14, 7 + Math.sqrt(node.mentions) * 2))
      .attr("y", (node) => -Math.min(14, 7 + Math.sqrt(node.mentions) * 2))
      .attr("width", (node) => Math.min(28, 14 + Math.sqrt(node.mentions) * 4))
      .attr("height", (node) => Math.min(28, 14 + Math.sqrt(node.mentions) * 4))
      .attr("rx", 2);

    nodeSelection.filter((node) => node.type === "topic")
      .append("circle")
      .attr("class", "network-node-core")
      .attr("r", (node) => Math.min(13, 5 + Math.sqrt(node.mentions) * 1.4));

    nodeSelection.filter((node) => node.type === "topic").append("circle")
      .attr("class", "network-direction-dot")
      .attr("cx", (node) => {
        const radius = Math.min(13, 5 + Math.sqrt(node.mentions) * 1.4);
        return radius * .72;
      })
      .attr("cy", (node) => {
        const radius = Math.min(13, 5 + Math.sqrt(node.mentions) * 1.4);
        return -radius * .72;
      })
      .attr("r", 3.2);

    const labelSelection = nodeSelection.append("text")
      .attr("class", "network-label")
      .attr("x", (node) => node.type === "stock" ? 17 : 13)
      .attr("y", 4)
      .text(compactAnalysisNodeLabel);
    nodeSelection.filter((node) => node.type === "topic").append("title")
      .text((node) => `主题：${analysisNodeLabel(node)} · ${node.mentions} 个事件 · 舆情${directionLabels[node.direction]}`);

    const labelFacesLeft = (node: SimNode) => (node.x || 0) > size.width - NETWORK_LABEL_MAX_WIDTH
      || ((node.y || 0) < NETWORK_CONTROLS_BOTTOM + NETWORK_NODE_RADIUS
        && (node.x || 0) > size.width - NETWORK_CONTROLS_WIDTH - NETWORK_LABEL_MAX_WIDTH);

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
        .attr("x", (node) => labelFacesLeft(node) ? (node.type === "stock" ? -17 : -13) : (node.type === "stock" ? 17 : 13))
        .attr("text-anchor", (node) => labelFacesLeft(node) ? "end" : "start");
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
  }, [links, nodes, onClearSelection, onPreview, onPreviewEnd, onTogglePreview, size]);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll<SVGGElement, SimNode>(".network-node")
      .classed("is-external-active", (node) => node.id === highlightedNodeId)
      .classed("is-external-related", (node) => Boolean(highlightedNodeId && node.id !== highlightedNodeId && links.some((link) => (link.source === highlightedNodeId && link.target === node.id) || (link.target === highlightedNodeId && link.source === node.id))));
    svg.selectAll<SVGLineElement, SimLink>(".network-links line")
      .classed("is-external-related", (link) => Boolean(highlightedNodeId && (nodeId(link.source) === highlightedNodeId || nodeId(link.target) === highlightedNodeId)));
  }, [highlightedNodeId, links]);

  const selectedValidation = selected ? marketValidation(selected) : null;

  return (
    <div className="stock-network" ref={wrapRef}>
      <div className="network-controls" aria-label="关联图缩放控制">
        <button type="button" className="icon-button" onClick={() => controlsRef.current?.in()} title="放大" aria-label="放大"><ZoomIn size={16} /></button>
        <button type="button" className="icon-button" onClick={() => controlsRef.current?.out()} title="缩小" aria-label="缩小"><ZoomOut size={16} /></button>
        <button type="button" className="icon-button" onClick={() => controlsRef.current?.reset()} title="重置视图" aria-label="重置视图"><RotateCcw size={16} /></button>
      </div>
      {onToggleScope && totalNodeCount > 12 ? (
        <button type="button" className="network-scope-button" onClick={onToggleScope} aria-pressed={expanded}>
          {expanded ? "收起核心" : `显示更多关系 · ${totalNodeCount - nodes.length}`}
        </button>
      ) : null}
      <svg ref={svgRef} className="network-svg" role="img" aria-label="主题与股票关联图" />
      {!links.length ? <div className="analysis-empty">{emptyMessage}</div> : null}
      {linkPreview ? (
        <div
          className={`network-link-preview is-${linkPreview.link.type} confidence-${linkPreview.link.confidence}`}
          style={{
            left: Math.max(10, Math.min(linkPreview.x + 12, Math.max(10, size.width - 340))),
            top: Math.max(10, Math.min(linkPreview.y + 12, Math.max(10, size.height - 260))),
          }}
        >
          <header>
            <strong>{relationshipLabels[linkPreview.link.type]}</strong>
            <span>{confidenceLabels[linkPreview.link.confidence]}</span>
          </header>
          <p>{nodeLabel(nodes, linkPreview.link.source)} ↔ {nodeLabel(nodes, linkPreview.link.target)}</p>
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
        <div className={`network-selection direction-${selected.direction} ${periodChangeClass(selected)}`} style={periodChangeStyle(selected)}>
          <div className="network-selection-identity">
            <i className={`is-${selected.type}`} />
            <strong>{analysisNodeLabel(selected)}</strong>
            {selected.symbol ? <span>{selected.symbol}</span> : null}
          </div>
          {selected.type === "stock" ? <span className={`network-period ${periodChangeClass(selected)}`} title={periodChangeLabel(selected, true)}>{periodChangeLabel(selected)}</span> : null}
          {selectedValidation ? (
            <div className={`market-validation is-${selectedValidation.tone}`} title={reactionLabel(selected)}>
              <span className="market-validation-status">{selectedValidation.status}</span>
              <strong>{selectedValidation.headline}</strong>
              {selectedValidation.metrics.length ? (
                <div className="market-validation-metrics">
                  {selectedValidation.metrics.map((metric) => (
                    <span className={`is-${valueTone(metric.value)}`} key={metric.label}>{metric.label} <b>{signedPercent(metric.value)}</b></span>
                  ))}
                </div>
              ) : null}
              <small>{selectedValidation.context}</small>
            </div>
          ) : null}
          <span className="network-selection-context">{selected.mentions} 个事件 · 舆情{directionLabels[selected.direction]}</span>
        </div>
      ) : null}
    </div>
  );
}
