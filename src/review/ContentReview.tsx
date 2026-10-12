import { useEffect, useState } from 'react';

type Language = 'en' | 'zh';
const LANGUAGE_KEY = 'jingxing.locale';
const messages = {
  en: {
    brand: 'JINGXING', status: 'CONTENT REVIEW', title: 'Content review in progress',
    description: 'External content is paused while we review its sources and presentation.',
    paused: 'Currently paused', categories: ['News reports', 'Financial markets', 'Maps and tracking', 'External media'],
    note: 'This page does not connect to sources or load external content.',
    footer: 'Jingxing · Content review',
  },
  zh: {
    brand: '景行', status: '内容安全审查', title: '内容安全审查中',
    description: '外部内容已暂停，正在审查消息来源与展示内容。',
    paused: '暂时暂停', categories: ['新闻报道', '财经行情', '地图与追踪', '外部媒体'],
    note: '此页面不连接消息源，也不加载外部内容。',
    footer: '景行 · 内容安全审查',
  },
};

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (saved === 'en' || saved === 'zh') return saved;
  } catch { /* The page remains usable when local storage is unavailable. */ }
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export default function ContentReview() {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const copy = messages[language];
  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    document.title = `${language === 'zh' ? '景行' : 'Jingxing'} — ${copy.title}`;
  }, [language, copy.title]);
  function selectLanguage(next: Language) {
    setLanguage(next);
    try { localStorage.setItem(LANGUAGE_KEY, next); } catch { /* Optional preference only. */ }
  }
  return <div className="review-page">
    <header className="review-header">
      <span className="review-brand">{copy.brand}</span>
      <div className="review-language" role="group" aria-label={language === 'zh' ? '显示语言' : 'Display language'}>
        <button type="button" lang="zh-CN" aria-pressed={language === 'zh'} onClick={() => selectLanguage('zh')}>中文</button>
        <button type="button" lang="en" aria-pressed={language === 'en'} onClick={() => selectLanguage('en')}>English</button>
      </div>
    </header>
    <main className="review-main">
      <div className="review-rule" aria-hidden="true" />
      <p className="review-eyebrow">{copy.status}</p>
      <h1>{copy.title}</h1>
      <p className="review-description">{copy.description}</p>
      <section className="review-scope" aria-labelledby="paused-heading">
        <h2 id="paused-heading">{copy.paused}</h2>
        <ul>{copy.categories.map(category => <li key={category}>{category}</li>)}</ul>
      </section>
      <p className="review-note">{copy.note}</p>
    </main>
    <footer className="review-footer">{copy.footer}</footer>
  </div>;
}
