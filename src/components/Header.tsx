import { Activity, ArrowLeft, ChartNoAxesCombined, Github, Monitor, Moon, Radio, Sun, Wifi, WifiOff } from "lucide-react";
import type { SourceStatus } from "../../shared/types";
import type { ThemeMode } from "../lib/theme";
import { formatClock, formatDay } from "../lib/time";

interface HeaderProps {
  connected: boolean;
  serverTime: string;
  sources: SourceStatus[];
  theme: ThemeMode;
  insightsActive: boolean;
  signalsHidden: boolean;
  onInsightsClick: () => void;
  onThemeChange: (theme: ThemeMode) => void;
}

const themeOptions = [
  { mode: "light" as const, label: "浅色模式", icon: Sun },
  { mode: "dark" as const, label: "深色模式", icon: Moon },
  { mode: "system" as const, label: "跟随系统", icon: Monitor },
];

export function Header({ connected, serverTime, sources, theme, insightsActive, signalsHidden, onInsightsClick, onThemeChange }: HeaderProps) {
  const liveCount = sources.filter((source) => source.state === "live").length;
  return (
    <>
      <header className="topbar">
        <div className="brand" aria-label="景行 Jingxing">
          <img className="brand-mark" src={`${import.meta.env.BASE_URL}brand/jingxing-mark.svg?v=finance-1`} alt="" aria-hidden="true" />
          <div>
            <div className="brand-name">景行 <span>JINGXING</span></div>
            <div className="brand-origin">高山仰止，景行行止</div>
          </div>
        </div>

        <div className="topbar-center" aria-label="北京时间">
          <span className="header-date">{formatDay(serverTime)}</span>
          <strong>{formatClock(serverTime)}</strong>
          <span className="timezone">UTC+8</span>
        </div>

        <div className="topbar-actions">
          <div className={`connection-state ${connected ? "is-connected" : ""}`}>
            {connected ? <Wifi size={15} /> : <WifiOff size={15} />}
            <span>{connected ? "实时连接" : "正在重连"}</span>
          </div>
          <button
            className={`text-button header-insights-button ${insightsActive ? "is-active" : ""}`}
            onClick={onInsightsClick}
            aria-label={insightsActive ? "返回实时市场" : "打开市场洞察"}
            aria-pressed={insightsActive}
          >
            {insightsActive ? <ArrowLeft size={16} /> : <ChartNoAxesCombined size={16} />}
            <span>{insightsActive ? "返回实时" : "市场洞察"}</span>
          </button>
          <a
            className="icon-button github-link"
            href="https://github.com/LoftyMountains/LoftyMountains"
            target="_blank"
            rel="noreferrer"
            title="查看 GitHub 仓库"
            aria-label="查看 GitHub 仓库"
          >
            <Github size={17} />
          </a>
          <div className="theme-switcher" role="group" aria-label="颜色模式">
            {themeOptions.map(({ mode, label, icon: Icon }) => (
              <button
                type="button"
                className={theme === mode ? "is-active" : ""}
                key={mode}
                title={label}
                aria-label={label}
                aria-pressed={theme === mode}
                onClick={() => onThemeChange(mode)}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className={`signal-strip ${signalsHidden ? "is-hidden" : ""}`} aria-hidden={signalsHidden}>
        <div className="signal-lead"><Radio size={14} /> 全球财经信号</div>
        <div className="source-marquee">
          {sources.map((source) => (
            <span className="source-signal" key={source.id}>
              <i className={`status-dot is-${source.state}`} />
              {source.label}
              {source.latencyMs !== null && source.state === "live" ? <small>{source.latencyMs}ms</small> : null}
            </span>
          ))}
        </div>
        <div className="signal-meta">
          <span><Activity size={13} /> {liveCount}/{sources.length} 在线</span>
        </div>
      </div>
    </>
  );
}
