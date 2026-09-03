import { Pause, Play, RotateCcw, SkipBack, X } from "lucide-react";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import { REPLAY_SPEEDS, replaySpeedLabel, type ReplaySpeed } from "../lib/replay-clock";
import { formatClock, formatFull } from "../lib/time";

interface ReplayBarProps {
  fromMs: number;
  toMs: number;
  cursorMs: number;
  playing: boolean;
  speed: ReplaySpeed;
  announcement: string;
  announcementRevision: number;
  onPlayingChange: (playing: boolean) => void;
  onCursorChange: (cursorMs: number) => void;
  onCursorCommit: (cursorMs: number) => void;
  onSpeedChange: (speed: number) => void;
  onClose: () => void;
}

const seekKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"]);

export function ReplayBar({
  fromMs,
  toMs,
  cursorMs,
  playing,
  speed,
  announcement,
  announcementRevision,
  onPlayingChange,
  onCursorChange,
  onCursorCommit,
  onSpeedChange,
  onClose,
}: ReplayBarProps) {
  const progress = (cursorMs - fromMs) / Math.max(1, toMs - fromMs) * 100;
  const ended = cursorMs >= toMs;
  const playbackAction = ended && !playing ? "重新播放" : playing ? "暂停" : "播放";

  const pauseForSeek = (event: KeyboardEvent<HTMLInputElement> | PointerEvent<HTMLInputElement>) => {
    if ("key" in event && !seekKeys.has(event.key)) return;
    onCursorChange(Number(event.currentTarget.value));
  };
  const commitSeek = (event: KeyboardEvent<HTMLInputElement> | PointerEvent<HTMLInputElement>) => {
    if ("key" in event && !seekKeys.has(event.key)) return;
    onCursorCommit(Number(event.currentTarget.value));
  };

  return (
    <section className={`replay-bar ${playing ? "is-playing" : ended ? "is-ended" : "is-paused"}`} aria-label="回放控制">
      <div className="replay-title">
        <span className="replay-pulse" aria-hidden="true" />
        <div>
          <small>REPLAY · {ended && !playing ? "已结束" : playing ? "播放中" : "已暂停"}</small>
          <time dateTime={new Date(cursorMs).toISOString()}>{formatFull(cursorMs)}</time>
        </div>
      </div>
      <button className="icon-button replay-reset" onClick={() => onCursorCommit(fromMs)} title="回到起点" aria-label="回到起点"><SkipBack size={18} /></button>
      <button className="play-button" onClick={() => onPlayingChange(!playing)} title={playbackAction} aria-label={playbackAction}>
        {ended && !playing ? <RotateCcw size={19} /> : playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
      </button>
      <div className="replay-track">
        <input
          type="range"
          min={fromMs}
          max={toMs}
          step={1_000}
          value={cursorMs}
          onPointerDown={pauseForSeek}
          onPointerUp={commitSeek}
          onKeyDown={pauseForSeek}
          onKeyUp={commitSeek}
          onChange={(event) => onCursorChange(Number(event.target.value))}
          aria-label="回放时间轴"
          aria-valuetext={`北京时间 ${formatFull(cursorMs)}`}
          style={{ "--progress": `${progress}%` } as CSSProperties}
        />
        <div className="replay-range" aria-hidden="true">
          <time dateTime={new Date(fromMs).toISOString()} title={`起点 ${formatFull(fromMs)}`}>{formatClock(fromMs)}</time>
          <time className="replay-range-current" dateTime={new Date(cursorMs).toISOString()}>{formatClock(cursorMs)}</time>
          <time dateTime={new Date(toMs).toISOString()} title={`终点 ${formatFull(toMs)}`}>{formatClock(toMs)}</time>
        </div>
      </div>
      <select className="speed-select" value={speed} onChange={(event) => onSpeedChange(Number(event.target.value))} aria-label={`回放速率，当前 ${replaySpeedLabel(speed)}`}>
        {REPLAY_SPEEDS.map((option) => <option value={option} key={option}>{replaySpeedLabel(option)}</option>)}
      </select>
      <button className="icon-button replay-close" onClick={onClose} title="退出回放" aria-label="退出回放"><X size={18} /></button>
      <span className="replay-announcement" role="status" aria-live="polite" aria-atomic="true" key={announcementRevision}>{announcement}</span>
    </section>
  );
}
