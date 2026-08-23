import type { AnalysisLink, AnalysisNode } from "../../shared/types";
import { confidenceLabels, relationshipLabels, sourceLabels } from "../lib/relationships";
import { analysisNodeLabel } from "../lib/stocks";
import { formatFull } from "../lib/time";

interface RelationshipListProps {
  nodes: AnalysisNode[];
  links: AnalysisLink[];
  emptyMessage: string;
}

export function RelationshipList({ nodes, links, emptyMessage }: RelationshipListProps) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  if (!links.length) return <div className="relationship-list-empty">{emptyMessage}</div>;

  return (
    <div className="relationship-list" role="region" aria-label="筛选后的关联关系列表">
      {links.map((link) => {
        const sourceNode = nodeById.get(link.source);
        const targetNode = nodeById.get(link.target);
        const source = sourceNode ? analysisNodeLabel(sourceNode) : link.source.replace(/^[^:]+:/, "");
        const target = targetNode ? analysisNodeLabel(targetNode) : link.target.replace(/^[^:]+:/, "");
        const evidence = link.evidence || [];
        return (
          <details className="relationship-list-item" key={`${link.type}:${link.source}:${link.target}`}>
            <summary>
              <span className="relationship-list-summary">
                <span className="relationship-list-pair">
                  <strong title={sourceNode?.symbol ? `${source} ${sourceNode.symbol}` : source}><span>{source}</span>{sourceNode?.symbol ? <small>{sourceNode.symbol}</small> : null}</strong>
                  <i aria-hidden="true">↔</i>
                  <strong title={targetNode?.symbol ? `${target} ${targetNode.symbol}` : target}><span>{target}</span>{targetNode?.symbol ? <small>{targetNode.symbol}</small> : null}</strong>
                </span>
                <span className={`relationship-list-type is-${link.type}`}>{relationshipLabels[link.type]}</span>
                <span className="relationship-list-metrics">{confidenceLabels[link.confidence]} · 共同事件 {link.cooccurrenceCount} · NPMI {link.npmi.toFixed(2)}</span>
              </span>
            </summary>
            <div className="relationship-list-evidence">
              {!evidence.length ? <p>证据标题暂不可用</p> : (
                <ul>
                  {evidence.map((item) => (
                    <li key={item.eventId}>
                      <time dateTime={item.publishedAt}>{formatFull(item.publishedAt)}</time>
                      <strong>{item.title}</strong>
                      <span>{item.sources.map((sourceId) => sourceLabels[sourceId]).join(" · ")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
