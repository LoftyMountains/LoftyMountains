import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const record = {
  id: 'bbc-1', source_id: 'bbc-world', source_name: 'BBC World', source: 'bbc.co.uk', source_role: 'newsroom',
  title: 'Close', summary: 'Original publisher summary must stay unchanged.',
  link: 'https://www.bbc.com/news/articles/example', published: '2026-10-12T00:00:00Z',
  analysis_allowed: false, risk_score: 10, keyword_assessment: 'DERIVED EXPLANATION MUST NOT APPEAR', coords: [1, 2],
};
const source = { id: 'bbc-world', handle: 'bbc-world', name: 'BBC World', source_role: 'newsroom', count: 1, latest: record.published, status: 'ok', analysis_allowed: false };

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('localStorage', { getItem: () => 'en' });
});
afterEach(() => vi.unstubAllGlobals());

async function renderFeed(data: unknown) {
  const [{ createElement }, { renderToStaticMarkup }, { default: IntelFeed }] = await Promise.all([
    import('react'), import('react-dom/server'), import('./IntelFeed'),
  ]);
  return renderToStaticMarkup(createElement(IntelFeed, { data }));
}

describe('mobile news source boundaries', () => {
  it('includes the shared source policy, Council references, source health and exclusions in the mobile feed', async () => {
    const html = await renderFeed({ news: [record], news_meta: { sources: [source], excluded_sources: [{ id: 'excluded', name: 'Excluded publisher', admission_reason: 'Usage review pending.' }] } });
    expect(html).toContain('Sources and humanitarian standards');
    expect(html).toContain('https://main.un.org/securitycouncil/en/content/resolutions-0');
    expect(html).toContain('https://main.un.org/securitycouncil/en/content/presidential-statements');
    expect(html).toContain('https://main.un.org/securitycouncil/en/content/press-statements-0');
    expect(html).toContain('Check successful');
    expect(html).toContain('Excluded publisher');
    expect(html).toContain('Usage review pending.');
    expect(html).toContain('aria-expanded="true"');
  });

  it('preserves the publisher text and links but suppresses restricted derived explanations, map actions and risk labels', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'zh' });
    const html = await renderFeed({ news: [record], news_meta: { sources: [source] } });
    expect(html).toContain('新闻机构报道');
    expect(html).toContain('>Close</a>');
    expect(html).toContain(record.summary);
    expect(html).toContain(`href="${record.link}"`);
    expect(html).toContain('仅供显示；不参与自动分析。');
    expect(html).not.toContain(record.keyword_assessment);
    expect(html).not.toContain('aria-label="在地图上显示"');
    expect(html).not.toMatch(/risk-critical|risk-low|>CRITICAL<|>LOW</);
  });

  it('honors a source-level analysis restriction even if a record carries an old permission flag', async () => {
    const html = await renderFeed({ news: [{ ...record, analysis_allowed: true }], news_meta: { sources: [source] } });
    expect(html).toContain('Display only; excluded from automated analysis.');
    expect(html).not.toContain(record.keyword_assessment);
    expect(html).not.toContain('aria-label="Show on map"');
  });

  it('retains permitted keyword explanations while unknown or empty feeds never imply safe conditions', async () => {
    const permitted = await renderFeed({ news: [{ ...record, analysis_allowed: true, keyword_assessment: 'Keyword filter matched one term.' }], news_meta: { sources: [{ ...source, analysis_allowed: true }] } });
    expect(permitted).toContain('Keyword filter matched one term.');
    expect(permitted).toContain('aria-label="Show on map"');
    const empty = await renderFeed({ news: [] });
    expect(empty).toContain('Source status is unknown until a source report is available.');
    expect(empty).toContain('Missing data does not establish safe conditions.');
    expect(empty).not.toContain('AWAITING INTELLIGENCE');
    expect(empty).not.toContain('alert-green');
  });
});
