import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CalendarSearch, CircleAlert, History, Play, Search, X } from "lucide-react";

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
  const dialogRef = useRef<HTMLElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!restoreFocusRef.current && document.activeElement instanceof HTMLElement) {
      restoreFocusRef.current = document.activeElement;
    }
    const appShell = document.querySelector<HTMLElement>(".app-shell");
    const hadInert = appShell?.hasAttribute("inert") || false;
    const previousAriaHidden = appShell?.getAttribute("aria-hidden") ?? null;
    appShell?.setAttribute("inert", "");
    appShell?.setAttribute("aria-hidden", "true");
    firstFieldRef.current?.focus();

    const containFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        props.onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])"))
        .filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", containFocus);
    return () => {
      window.removeEventListener("keydown", containFocus);
      if (!hadInert) appShell?.removeAttribute("inert");
      if (previousAriaHidden === null) appShell?.removeAttribute("aria-hidden");
      else appShell?.setAttribute("aria-hidden", previousAriaHidden);
      window.requestAnimationFrame(() => {
        if (dialogRef.current?.isConnected) return;
        const previousTrigger = restoreFocusRef.current;
        const replacementTrigger = previousTrigger?.dataset.queryFocusReturn === "integrity"
          ? document.querySelector<HTMLElement>('[data-query-focus-return="integrity"]')
          : null;
        const primaryTrigger = document.querySelector<HTMLElement>('[data-query-focus-return="primary"]');
        (previousTrigger?.isConnected ? previousTrigger : replacementTrigger || primaryTrigger)?.focus();
      });
    };
  }, []);

  const feedbackId = props.error ? "query-error" : props.busy ? "query-progress" : undefined;
  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <section ref={dialogRef} className="query-dialog" role="dialog" aria-modal="true" aria-labelledby="query-title" aria-describedby={feedbackId} aria-busy={props.busy} tabIndex={-1}>
        <header>
          <div>
            <span className="eyebrow">TIME NAVIGATOR</span>
            <h2 id="query-title">时间查询与回放</h2>
          </div>
          <button type="button" className="icon-button" onClick={props.onClose} title="关闭" aria-label="关闭"><X size={18} /></button>
        </header>

        <div className="query-fields">
          <label>
            <span>起始时间（北京时间）</span>
            <div className="input-shell"><History size={16} /><input ref={firstFieldRef} type="datetime-local" value={props.from} onChange={(event) => props.onFromChange(event.target.value)} /></div>
          </label>
          <label>
            <span>结束时间（北京时间）</span>
            <div className="input-shell"><CalendarSearch size={16} /><input type="datetime-local" value={props.to} onChange={(event) => props.onToChange(event.target.value)} /></div>
          </label>
          <label className="query-keyword">
            <span>关键词</span>
            <div className="input-shell"><Search size={16} /><input type="search" value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} placeholder="政策、公司、市场…" onKeyDown={(event) => event.key === "Enter" && !props.busy && props.onSearch()} /></div>
          </label>
        </div>

        <div className="query-feedback" aria-live="polite" aria-atomic="true">
          {props.error ? <div id="query-error" className="form-error" role="alert"><CircleAlert size={16} aria-hidden="true" />{props.error}</div> : null}
          {!props.error && props.busy ? <div id="query-progress" className="query-progress" role="status">正在获取历史数据，请稍候</div> : null}
        </div>
        <footer>
          <button type="button" className="secondary-button" disabled={props.busy} onClick={props.onSearch}><Search size={16} />检索消息</button>
          <button type="button" className="primary-button" disabled={props.busy} onClick={props.onReplay}><Play size={16} fill="currentColor" />加载回放</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
