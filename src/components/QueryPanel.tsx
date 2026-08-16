import { CalendarSearch, History, Play, Search, X } from "lucide-react";

interface QueryPanelProps {
  from: string;
  to: string;
  query: string;
  busy: boolean;
  error: string | null;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onClose: () => void;
  onSearch: () => void;
  onReplay: () => void;
}

export function QueryPanel(props: QueryPanelProps) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <section className="query-dialog" role="dialog" aria-modal="true" aria-labelledby="query-title">
        <header>
          <div>
            <span className="eyebrow">TIME NAVIGATOR</span>
            <h2 id="query-title">时间查询与回放</h2>
          </div>
          <button className="icon-button" onClick={props.onClose} title="关闭" aria-label="关闭"><X size={18} /></button>
        </header>

        <div className="query-fields">
          <label>
            <span>起始时间（北京时间）</span>
            <div className="input-shell"><History size={16} /><input type="datetime-local" value={props.from} onChange={(event) => props.onFromChange(event.target.value)} /></div>
          </label>
          <label>
            <span>结束时间（北京时间）</span>
            <div className="input-shell"><CalendarSearch size={16} /><input type="datetime-local" value={props.to} onChange={(event) => props.onToChange(event.target.value)} /></div>
          </label>
          <label className="query-keyword">
            <span>关键词</span>
            <div className="input-shell"><Search size={16} /><input type="search" value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} placeholder="政策、公司、市场…" onKeyDown={(event) => event.key === "Enter" && props.onSearch()} /></div>
          </label>
        </div>

        {props.error ? <div className="form-error">{props.error}</div> : null}
        <footer>
          <button className="secondary-button" disabled={props.busy} onClick={props.onSearch}><Search size={16} />检索消息</button>
          <button className="primary-button" disabled={props.busy} onClick={props.onReplay}><Play size={16} fill="currentColor" />加载回放</button>
        </footer>
      </section>
    </div>
  );
}
