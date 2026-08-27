import { ChartNoAxesCombined, Github, Monitor, Moon, Newspaper, Sun } from "lucide-react";
import type { SourceStatus } from "../../shared/types";
import type { ThemeMode } from "../lib/theme";
import { formatClock, formatDay } from "../lib/time";

interface HeaderProps {
  connected: boolean;
  serverTime: string;
  sources: SourceStatus[];
  theme: ThemeMode;
  insightsActive: boolean;
  onInsightsClick: () => void;
  onThemeChange: (theme: ThemeMode) => void;
}

const themeOptions = [
  { mode: "light" as const, label: "浅色模式", icon: Sun },
  { mode: "dark" as const, label: "深色模式", icon: Moon },
  { mode: "system" as const, label: "跟随系统", icon: Monitor },
];

export function Header({ connected, serverTime, sources, theme, insightsActive, onInsightsClick, onThemeChange }: HeaderProps) {
  const liveCount = sources.filter((source) => source.state === "live").length;
  return (
    <header className="topbar">
      <div className="brand" aria-label="景行 Jingxing">
        <img className="brand-mark" src={`${import.meta.env.BASE_URL}brand/jingxing-mark.svg?v=finance-1`} alt="" aria-hidden="true" />
        <div>
          <div className="brand-name">景行 <span>JINGXING</span></div>
          <div className="brand-origin">高山仰止，景行行止</div>
        </div>
      </div>

      <nav className="workspace-switcher" aria-label="主要视图">
        <button type="button" className={!insightsActive ? "is-active" : ""} aria-label="实时快讯" aria-current={!insightsActive ? "page" : undefined} onClick={() => insightsActive && onInsightsClick()}>
          <Newspaper size={15} />
          <span>快讯</span>
        </button>
        <button type="button" className={insightsActive ? "is-active" : ""} aria-label="市场洞察" aria-current={insightsActive ? "page" : undefined} onClick={() => !insightsActive && onInsightsClick()}>
          <ChartNoAxesCombined size={15} />
          <span>洞察</span>
        </button>
      </nav>

      <div className="topbar-actions">
        <div className={`market-status ${connected ? "is-connected" : "is-reconnecting"}`} aria-label={`北京时间 ${formatClock(serverTime)}，${connected ? "实时连接" : "正在重连"}，${liveCount} 个数据源在线`}>
          <i aria-hidden="true" />
          <time dateTime={serverTime}>{formatClock(serverTime)}</time>
          <span>{connected ? `${liveCount}/${sources.length || 0} 在线` : "重连中"}</span>
        </div>
        <a className="icon-button github-link" href="https://github.com/LoftyMountains/LoftyMountains" target="_blank" rel="noreferrer" title="查看 GitHub 仓库" aria-label="查看 GitHub 仓库">
          <Github size={17} />
        </a>
        <div className="theme-switcher" role="group" aria-label="颜色模式">
          {themeOptions.map(({ mode, label, icon: Icon }) => (
            <button type="button" className={theme === mode ? "is-active" : ""} key={mode} title={label} aria-label={label} aria-pressed={theme === mode} onClick={() => onThemeChange(mode)}>
              <Icon size={14} />
            </button>
          ))}
        </div>
      </div>
      <span className="topbar-date" aria-hidden="true">{formatDay(serverTime)}</span>
    </header>
  );
}
