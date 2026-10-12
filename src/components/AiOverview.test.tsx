import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const basis = 'Existing admitted server snapshots only; client-provided headlines and health claims are not trusted evidence.';
const evidence = {
  status: 'available' as 'available' | 'partial' | 'unknown',
  requested: 1, matched: 1, excluded: 0, restricted: 0, unverified: 0,
  checked_sources: 2, total_sources: 2, stale_sources: 0, unavailable_sources: 0, basis,
};
const sourceHeadline = 'Original publisher headline: Gaza hospital access';

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('localStorage', { getItem: () => 'en' });
});
afterEach(() => vi.unstubAllGlobals());

async function renderBrief({ newsEvidence = evidence, empty = false, overview = sourceHeadline }: {
  newsEvidence?: typeof evidence | null;
  empty?: boolean;
  overview?: string;
} = {}) {
  const [{ createElement }, { renderToStaticMarkup }, { AlertsBrief }, { buildAlertBrief }] = await Promise.all([
    import('react'), import('react-dom/server'), import('./AiOverview'), import('@/lib/alert-digest'),
  ]);
  const brief = buildAlertBrief({ news: empty ? [] : [{ id: 'publisher-1', title: sourceHeadline, source: 'publisher.example', source_role: 'newsroom' }] });
  return renderToStaticMarkup(createElement(AlertsBrief, {
    accent: '#c9a55c',
    result: { overview, generatedBy: 'analyst', generatedAt: '2026-10-12T00:00:00Z', highlights: [], brief,
      ...(newsEvidence ? { news_evidence: newsEvidence } : {}),
    },
  }));
}

describe('alert overview evidence', () => {
  it('does not present zero reports as safe even when every source check succeeded', async () => {
    const html = await renderBrief({ empty: true, newsEvidence: { ...evidence, status: 'unknown', requested: 0, matched: 0 } });
    expect(html).toContain('aria-label="No current news evidence"');
    expect(html).toContain('News conditions are unknown; missing data does not establish safe conditions.');
    expect(html).toContain('Current source checks: 2/2.');
    expect(html).not.toContain('Current snapshot: 0 reports');
  });

  it('exposes partial coverage, excluded records, and the server heuristic findings', async () => {
    const serverFinding = 'A server-only evidence limitation must remain visible.';
    const html = await renderBrief({
      overview: serverFinding,
      newsEvidence: { ...evidence, status: 'partial', requested: 3, excluded: 2, unverified: 2, checked_sources: 1, total_sources: 3, stale_sources: 1, unavailable_sources: 1 },
    });
    expect(html).toContain('aria-label="Incomplete news evidence"');
    expect(html).toContain('Stale sources: 1. Unavailable sources: 1.');
    expect(html).toContain('Matched 1 of 3 submitted news records; 2 excluded.');
    expect(html).toContain('Records without a current admitted snapshot match: 2.');
    expect(html).toContain(serverFinding);
    expect(html).toContain(basis);
  });

  it('keeps available evidence distinct from partial or unknown status', async () => {
    const html = await renderBrief();
    expect(html).toContain('aria-label="Current news evidence"');
    expect(html).not.toContain('Incomplete news evidence');
    expect(html).not.toContain('News conditions are unknown');
    expect(html).toContain(sourceHeadline);
  });

  it('treats legacy responses without evidence metadata as unknown instead of inferring health from report counts', async () => {
    const html = await renderBrief({ newsEvidence: null });
    expect(html).toContain('aria-label="No current news evidence"');
    expect(html).not.toContain('Current source checks:');
  });

  it('distinguishes records excluded by analysis permission from unverified reporting', async () => {
    const html = await renderBrief({ empty: true, newsEvidence: { ...evidence, status: 'unknown', matched: 0, restricted: 1, excluded: 1 } });
    expect(html).toContain('No submitted news records can be used for this analysis because publisher permission is not established.');
    expect(html).toContain('Excluded by publisher usage restrictions: 1. This is not a finding that the reports are false.');
    expect(html).not.toContain('Records without a current admitted snapshot match:');
  });

  it('localizes evidence and known heuristic warnings without translating original publisher text', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'zh' });
    const html = await renderBrief({
      newsEvidence: { ...evidence, status: 'partial', requested: 3, excluded: 2, restricted: 1, unverified: 1, checked_sources: 1 },
      overview: `${sourceHeadline}\n\n• 2 submitted news record(s) could not be matched to a current admitted server snapshot and are excluded as unverified.`,
    });
    expect(html).toContain('aria-label="新闻证据不完整"');
    expect(html).toContain('提交的 3 条新闻记录中，1 条匹配当前快照，2 条已排除。');
    expect(html).toContain('因出版者用途限制排除：1 条。这不代表报道虚假。');
    expect(html).toContain('未匹配当前已准入快照的记录：1 条。');
    expect(html).toContain('提交的 2 条新闻记录未能匹配服务器当前已准入的快照，因未核实而被排除。');
    expect(html).toContain('仅依据服务器中已准入的现有快照');
    expect(html).toContain(sourceHeadline);
  });
});
