import { Pause, Play, SkipBack, X } from "lucide-react";
import { formatFull } from "../lib/time";

interface ReplayBarProps {
  current: number;
  total: number;
  timestamp: string | undefined;
  playing: boolean;
  speed: number;
  onPlayingChange: (playing: boolean) => void;
  onCurrentChange: (current: number) => void;
  onSpeedChange: (speed: number) => void;
  onClose: () => void;
}

export function ReplayBar({ current, total, timestamp, playing, speed, onPlayingChange, onCurrentChange, onSpeedChange, onClose }: ReplayBarProps) {
  const progress = total > 1 ? current / (total - 1) * 100 : 0;
  return (
    <section className="replay-bar" aria-label="回放控制">
      <div className="replay-title">
        <span className="replay-pulse" />
        <div><small>REPLAY</small><strong>{timestamp ? formatFull(timestamp) : "等待数据"}</strong></div>
      </div>
      <button className="icon-button" onClick={() => onCurrentChange(0)} title="回到起点" aria-label="回到起点"><SkipBack size={17} /></button>
      <button className="play-button" onClick={() => onPlayingChange(!playing)} title={playing ? "暂停" : "播放"} aria-label={playing ? "暂停" : "播放"}>
        {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
      </button>
      <div className="replay-track">
        <input
          type="range"
          min={0}
          max={Math.max(0, total - 1)}
          value={Math.min(current, Math.max(0, total - 1))}
          onChange={(event) => onCurrentChange(Number(event.target.value))}
          aria-label="回放时间轴"
          style={{ "--progress": `${progress}%` } as React.CSSProperties}
        />
        <div><span>起点</span><span>{current + 1} / {Math.max(1, total)}</span><span>终点</span></div>
      </div>
      <select className="speed-select" value={speed} onChange={(event) => onSpeedChange(Number(event.target.value))} aria-label="回放速度">
        <option value={1}>1×</option>
        <option value={2}>2×</option>
        <option value={4}>4×</option>
        <option value={8}>8×</option>
      </select>
      <button className="icon-button" onClick={onClose} title="退出回放" aria-label="退出回放"><X size={17} /></button>
    </section>
  );
}
