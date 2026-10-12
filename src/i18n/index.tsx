import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
export type Locale = 'en' | 'zh';
const KEY = 'jingxing.locale';
function initialLocale(): Locale {
  try { const saved = localStorage.getItem(KEY); if (saved === 'en' || saved === 'zh') return saved; } catch { /* private mode */ }
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}
let currentLocale = initialLocale();
export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|apos|quot|lt|gt|nbsp|rarr|larr|middot|times|mdash|ndash|hellip);/gi, (full, entity: string) => {
    const known: Record<string,string> = { amp:'&', apos:"'", quot:'\"', lt:'<', gt:'>', nbsp:' ', rarr:'→', larr:'←', middot:'·', times:'×', mdash:'—', ndash:'–', hellip:'…' };
    if (entity.startsWith('#')) { const code = parseInt(entity.slice(entity[1]?.toLowerCase() === 'x' ? 2 : 1), entity[1]?.toLowerCase() === 'x' ? 16 : 10); return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : full; }
    return known[entity.toLowerCase()] || full;
  });
}
const catalog: Record<string, string> = Object.assign({}, ...Object.values(import.meta.glob<Record<string,string>>('./catalog-*.ts', { eager: true, import: 'default' })));
for (const [key, value] of Object.entries(catalog)) { catalog[decodeEntities(key)] = decodeEntities(value); }
const templates = Object.entries(catalog).filter(([key]) => /\{\d+\}/.test(key)).map(([key, value]) => {
  const slots: number[] = [];
  const pattern = key.split(/(\{\d+\})/).map(part => {
    if (/^\{\d+\}$/.test(part)) { slots.push(Number(part.slice(1,-1))); return '(.+?)'; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return { regex: new RegExp(`^${pattern}$`, 's'), value, slots };
});
export const locale = () => currentLocale;
export function t(message: string, ...values: unknown[]): string {
  const original = decodeEntities(message);
  const key = original.trim().replace(/\s+/g, ' ');
  const translated = currentLocale === 'zh' && catalog[key] && catalog[key] !== key
    ? original.slice(0, original.length - original.trimStart().length) + decodeEntities(catalog[key]) + original.slice(original.trimEnd().length)
    : original;
  return translated.replace(/\{(\d+)\}/g, (match, index) => Number(index) < values.length ? String(values[Number(index)] ?? '') : match);
}
/** Render-boundary translation only: source records and all underlying identifiers stay unchanged. */
export function translateValue<T>(value: T): T {
  if (typeof value !== 'string' || currentLocale === 'en') return value;
  const key = decodeEntities(value).trim().replace(/\s+/g, ' ');
  if (Object.hasOwn(catalog, key)) return t(value) as T;
  for (const entry of templates) {
    const found = entry.regex.exec(key);
    if (!found) continue;
    const replacements: Record<number,string> = {};
    entry.slots.forEach((slot, index) => { replacements[slot] = found[index + 1]; });
    return entry.value.replace(/\{(\d+)\}/g, (match, slot) => replacements[Number(slot)] ?? match) as T;
  }
  return value;
}
export const LocaleContext = createContext({ locale: currentLocale, setLocale: (_next: Locale) => {} });
export function useLocale() { return useContext(LocaleContext); }
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState(currentLocale);
  const setLocale = (next: Locale) => { currentLocale = next; setSelected(next); try { localStorage.setItem(KEY, next); } catch { /* private mode */ } };
  useEffect(() => { document.documentElement.lang = selected === 'zh' ? 'zh-CN' : 'en'; window.dispatchEvent(new Event('jingxing:locale')); }, [selected]);
  return <LocaleContext.Provider value={{ locale: selected, setLocale }}>{children}</LocaleContext.Provider>;
}
export function LanguageSwitch() {
  const { locale: selected, setLocale } = useLocale();
  return <div className="jingxing-language" role="group" aria-label={selected === 'zh' ? '显示语言' : 'Display language'}>
    <button type="button" lang="zh-CN" aria-pressed={selected === 'zh'} onClick={() => setLocale('zh')}>中文</button>
    <button type="button" lang="en" aria-pressed={selected === 'en'} onClick={() => setLocale('en')}>EN</button>
  </div>;
}
/** Localize an HTML template before insertion. Never observes or mutates the live DOM. */
export function translatePopupHtml(html: string): string {
  if (currentLocale === 'en') return html;
  const template = document.createElement('template'); template.innerHTML = html;
  const visit = (node: Node) => {
    if (node instanceof Element && (node.matches('script,style,[translate="no"],[data-original]'))) return;
    if (node.nodeType === Node.TEXT_NODE && node.textContent) {
      const original = node.textContent;
      let translated = translateValue(original);
      if (translated === original) { const decorated = /^(\s*[^\p{L}\p{N}\s]+\s*)(.+)$/u.exec(original); if (decorated) translated = decorated[1] + translateValue(decorated[2]); }
      node.textContent = translated;
    }
    if (node instanceof Element) for (const key of ['title','aria-label','placeholder','alt']) { const value = node.getAttribute(key); if (value) node.setAttribute(key, translateValue(value)); }
    node.childNodes.forEach(visit);
  };
  template.content.childNodes.forEach(visit);
  return template.innerHTML;
}
