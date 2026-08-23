import { useEffect, useRef, useState } from "react";
import cloud from "d3-cloud";
import type { AnalysisWord } from "../../shared/types";

interface CloudWord extends AnalysisWord {
  size: number;
  x?: number;
  y?: number;
}

interface WordCloudProps {
  words: AnalysisWord[];
  selected: string | null;
  onPreview: (word: AnalysisWord, anchor: { x: number; y: number }) => void;
  onTogglePreview: (word: AnalysisWord, anchor: { x: number; y: number }) => void;
  onPreviewEnd: () => void;
}

const directionLabels: Record<AnalysisWord["direction"], string> = {
  positive: "偏正面",
  negative: "偏负面",
  mixed: "方向混合",
  neutral: "方向中性",
};

export function WordCloud({ words, selected, onPreview, onTogglePreview, onPreviewEnd }: WordCloudProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [placed, setPlaced] = useState<CloudWord[]>([]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!size.width || !size.height || !words.length) {
      setPlaced([]);
      return;
    }
    const areaPerWord = size.width < 260 ? 4_200 : size.width < 480 ? 3_000 : 2_600;
    const capacity = Math.max(12, Math.floor(size.width * size.height / areaPerWord));
    const visible = words.slice(0, capacity);
    const min = Math.min(...visible.map((word) => word.score));
    const max = Math.max(...visible.map((word) => word.score));
    const lower = size.width < 480 ? 12 : 13;
    const upper = size.width < 480 ? 34 : 46;
    const scale = (score: number) => {
      if (min === max) return (lower + upper) / 2;
      return lower + (Math.sqrt(score) - Math.sqrt(min)) / (Math.sqrt(max) - Math.sqrt(min)) * (upper - lower);
    };
    let seed = 1729;
    const random = () => {
      seed = seed * 16_807 % 2_147_483_647;
      return (seed - 1) / 2_147_483_646;
    };
    const layout = cloud<CloudWord>()
      .size([size.width, size.height])
      .words(visible.map((word) => ({ ...word, size: scale(word.score) })))
      .padding((word) => word.rank <= 10 ? 5 : 3)
      .rotate(0)
      .font('Inter, "PingFang SC", "Microsoft YaHei", sans-serif')
      .fontWeight((word) => word.rank <= 8 ? 700 : 500)
      .fontSize((word) => word.size)
      .random(random)
      .spiral("archimedean")
      .on("end", (result) => setPlaced(result));
    layout.start();
    return () => {
      layout.stop();
    };
  }, [size, words]);

  return (
    <div className="word-cloud" ref={containerRef} role="img" aria-label="财经快讯关键词词云">
      {placed.map((word) => (
        <button
          type="button"
          className={`cloud-word direction-${word.direction} rank-${Math.min(4, Math.ceil(word.rank / 4))} ${selected === word.text ? "is-selected" : ""}`}
          key={word.text}
          data-direction={word.direction}
          style={{
            left: `calc(50% + ${word.x || 0}px)`,
            top: `calc(50% + ${word.y || 0}px)`,
            fontSize: `${word.size}px`,
          }}
          onMouseEnter={(event) => onPreview(word, { x: event.clientX, y: event.clientY })}
          onMouseLeave={onPreviewEnd}
          onFocus={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            onPreview(word, { x: rect.right, y: rect.top });
          }}
          onBlur={onPreviewEnd}
          onClick={(event) => onTogglePreview(word, { x: event.clientX, y: event.clientY })}
          aria-pressed={selected === word.text}
          title={`${word.text} · ${word.count} 个事件 · 前窗 ${word.baselineCount} · 突发度 ${word.burst.toFixed(2)} · 来源多样性 ${Math.round(word.sourceDiversity * 100)}% · ${directionLabels[word.direction]} · ${word.example}`}
        >
          {word.text}
        </button>
      ))}
      {!placed.length ? <div className="analysis-empty">当前窗口暂无可统计词汇</div> : null}
    </div>
  );
}
