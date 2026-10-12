import { t as __t, translateValue as __tv, useLocale as __useLocale } from '@/i18n';
'use client';
import { Check, X, Undo2, MousePointerClick } from 'lucide-react';
import type { DrawMode, DrawProgress } from '@/lib/draw';
import { formatArea, formatDistance } from '@/lib/geo';
/**
 * OSIRIS — on-map drawing HUD
 *
 * While a shape is being drawn the operator is looking at the map, not at a
 * panel on the far side of the screen. Guidance that lives in the panel is
 * guidance nobody reads, which is what made drawing feel obscure: the steps and
 * the key bindings were correct, and in the wrong place.
 *
 * So the instruction, the running measurement and the controls sit over the
 * map, directly above where the clicking happens. Finish and Cancel are real
 * buttons — double-click and Escape still work, but nothing depends on knowing
 * about them.
 */
interface DrawHudProps {
    mode: DrawMode;
    progress: DrawProgress | null;
    onUndo: () => void;
    onFinish: () => void;
    onCancel: () => void;
}
const TITLE: Record<DrawMode, string> = {
    polygon: 'AREA',
    rectangle: 'BOX',
    circle: 'RADIUS',
    line: 'PATH',
};
/** What to do next, given how far along the shape is. */
function step(mode: DrawMode, vertices: number): string {
    if (vertices === 0) {
        return {
            polygon: 'Click the first corner of your area',
            rectangle: 'Click one corner of the box',
            circle: 'Click the centre point',
            line: 'Click the start of the path',
        }[mode];
    }
    switch (mode) {
        case 'rectangle': return 'Now click the opposite corner';
        case 'circle': return 'Now click to set the radius';
        case 'polygon':
            return vertices < 3
                ? `Keep clicking corners — ${3 - vertices} more needed`
                : 'Click more corners, or finish the area';
        case 'line':
            return vertices < 2 ? 'Click the next waypoint' : 'Click more waypoints, or finish the path';
    }
}
export default function DrawHud({ mode, progress, onUndo, onFinish, onCancel }: DrawHudProps) {
    __useLocale();
    const vertices = progress?.vertices ?? 0;
    const canFinish = progress?.closable ?? false;
    // Two-click shapes complete themselves, so offering Finish would be a button
    // that never does anything.
    const selfCompleting = mode === 'rectangle' || mode === 'circle';
    return (<div className="pointer-events-none absolute inset-x-0 top-3 z-[500] flex justify-center px-3">
      <div className="pointer-events-auto flex flex-col gap-2 rounded-xl border border-[var(--cyan-primary)]/40 bg-[var(--bg-panel)]/95 px-4 py-3 shadow-[0_10px_40px_rgba(0,0,0,0.6)] backdrop-blur-2xl">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--cyan-primary)]"/>
            <span className="text-[11px] font-mono font-bold tracking-[0.2em] text-[var(--cyan-primary)]">
              {__tv(TITLE[mode])}
            </span>
          </span>

          <span className="flex items-center gap-1.5 text-[12px] text-[var(--text-primary)]">
            <MousePointerClick className="h-3.5 w-3.5 text-[var(--text-muted)]"/>
            {__tv(step(mode, vertices))}
          </span>

          {/* Running measurement — the reason to keep watching the map. */}
          {__tv(progress && (progress.areaKm2 > 0 || progress.lengthKm > 0) && (<span className="ml-1 flex items-center gap-2 border-l border-[var(--border-secondary)] pl-3 text-[12px] font-mono tabular-nums text-white">
              {__tv(progress.radiusKm != null && progress.radiusKm > 0 && (<span>{__t("r ")}{__tv(formatDistance(progress.radiusKm))}</span>))}
              {__tv(progress.areaKm2 > 0 && <span>{__tv(formatArea(progress.areaKm2))}</span>)}
              {__tv(progress.areaKm2 === 0 && progress.lengthKm > 0 && (<span>{__tv(formatDistance(progress.lengthKm))}</span>))}
            </span>))}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={onUndo} disabled={vertices === 0} className="flex items-center gap-1.5 rounded-md border border-[var(--border-secondary)] px-2.5 py-1.5 text-[11px] font-mono text-[var(--text-secondary)] transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30">
            <Undo2 className="h-3 w-3"/>{__t(" Undo point")}</button>

          {__tv(!selfCompleting && (<button onClick={onFinish} disabled={!canFinish} className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11px] font-mono transition-colors ${canFinish
                ? 'border-[var(--alert-green)]/50 bg-[var(--alert-green)]/15 text-[var(--alert-green)] hover:bg-[var(--alert-green)]/25'
                : 'border-[var(--border-secondary)] text-[var(--text-muted)] opacity-40'}`}>
              <Check className="h-3 w-3"/>{__t("Finish ")}{__tv(mode === 'line' ? 'path' : 'area')}
            </button>))}

          <button onClick={onCancel} className="flex items-center gap-1.5 rounded-md border border-[var(--border-secondary)] px-2.5 py-1.5 text-[11px] font-mono text-[var(--text-secondary)] transition-colors hover:border-[var(--alert-red)]/40 hover:text-[var(--alert-red)]">
            <X className="h-3 w-3"/>{__t(" Cancel")}</button>

          <span className="ml-auto pl-2 text-[10px] font-mono text-[var(--text-muted)]">
            {__tv(vertices)}{__t(" point")}{__tv(vertices === 1 ? '' : 's')}
            {__tv(!selfCompleting && ' · or double-click the map to finish')}
          </span>
        </div>
      </div>
    </div>);
}
