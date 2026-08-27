import type { AnalysisWord } from "../../shared/types";
import { WordCloud } from "./WordCloud";

interface HotspotRadarProps {
  words: AnalysisWord[];
  connectedTopics: string[];
  selected: string | null;
  onPreview: (word: AnalysisWord, anchor: { x: number; y: number }) => void;
  onTogglePreview: (word: AnalysisWord, anchor: { x: number; y: number }) => void;
  onPreviewEnd: () => void;
}

const directionLabel: Record<AnalysisWord["direction"], string> = {
  positive: "正面",
  negative: "负面",
  mixed: "混合",
  neutral: "中性",
};

export function HotspotRadar({ words, connectedTopics, selected, onPreview, onTogglePreview, onPreviewEnd }: HotspotRadarProps) {
  const ranking = words.slice(0, 5);
  const connected = words.find((word) => connectedTopics.includes(word.text) && !ranking.includes(word));
  if (connected && ranking.length >= 5) ranking[ranking.length - 1] = connected;
  else if (connected) ranking.push(connected);

  return (
    <div className="hotspot-radar">
      <div className="hotspot-radar-cloud">
        <WordCloud
          words={words}
          selected={selected}
          onPreview={onPreview}
          onTogglePreview={onTogglePreview}
          onPreviewEnd={onPreviewEnd}
        />
      </div>
      <div className="hotspot-ranking" aria-label="热点主题排名">
        <div className="hotspot-ranking-heading">
          <span>热点排名</span>
          <span>事件 · 突发度 · 来源覆盖</span>
        </div>
        <ol>
          {ranking.map((word) => (
            <li key={word.text} className={selected === word.text ? "is-selected" : ""}>
              <button
                type="button"
                className={`direction-${word.direction}`}
                onMouseEnter={(event) => onPreview(word, { x: event.clientX, y: event.clientY })}
                onFocus={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  onPreview(word, { x: rect.right, y: rect.top });
                }}
                onMouseLeave={onPreviewEnd}
                onBlur={onPreviewEnd}
                onClick={(event) => onTogglePreview(word, { x: event.clientX, y: event.clientY })}
                aria-pressed={selected === word.text}
                title={`${word.text} · ${directionLabel[word.direction]} · ${word.example}`}
              >
                <b>{word.rank}</b>
                <strong>{word.text}</strong>
                <span>{word.count}</span>
                <span className={word.burst > 0 ? "is-burst" : "is-cooling"} title={`突发度 ${word.burst.toFixed(1)}`}>{word.burst.toFixed(1)}</span>
                <span title={`来源覆盖 ${Math.round(word.sourceDiversity * 100)}%`}>{Math.round(word.sourceDiversity * 100)}%</span>
              </button>
            </li>
          ))}
          {!words.length ? <li className="hotspot-ranking-empty">当前窗口暂无热点</li> : null}
        </ol>
      </div>
    </div>
  );
}
