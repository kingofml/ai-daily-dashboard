const fs = require('fs');
const path = require('path');

const API_DAILY = 'https://aihot.virxact.com/api/public/daily';
const API_ARCHIVE = 'https://aihot.virxact.com/api/public/dailies?take=5';
const SECTIONS = [
  { title: '模型发布/更新', id: 'section-models' },
  { title: '产品发布/更新', id: 'section-products' },
  { title: '行业动态', id: 'section-industry' },
  { title: '论文研究', id: 'section-paper' },
  { title: '技巧与观点', id: 'section-tip' },
];

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

function getBeijingTodayString() {
  const now = new Date();
  const beijing = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  const year = beijing.getFullYear();
  const month = String(beijing.getMonth() + 1).padStart(2, '0');
  const day = String(beijing.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatBeijingDate(dateInput) {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  }).format(date);
}

function truncateSummary(text, maxLen = 60) {
  if (!text) return '';
  text = String(text).trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '…';
}

function isValidUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function loadData() {
  const today = getBeijingTodayString();
  let raw = null;
  let isFallback = false;

  try {
    raw = await fetchJson(API_DAILY);
  } catch (err) {
    console.warn('Daily fetch failed, will fallback:', err.message);
  }

  if (!raw || raw.date !== today) {
    isFallback = true;
    const archive = await fetchJson(API_ARCHIVE);
    if (!archive || !Array.isArray(archive.items) || archive.items.length === 0) {
      throw new Error('没有可用的日报归档');
    }
    const latestDate = archive.items[0].date;
    if (!latestDate) {
      throw new Error('归档数据缺少日期');
    }
    raw = await fetchJson(`${API_DAILY}/${latestDate}`);
  }

  if (!raw || !Array.isArray(raw.sections)) {
    throw new Error('日报数据结构异常');
  }

  raw.isFallback = isFallback;
  return raw;
}

function buildSectionMap(rawSections) {
  const map = new Map();
  for (const section of SECTIONS) {
    map.set(section.title, []);
  }
  if (Array.isArray(rawSections)) {
    for (const raw of rawSections) {
      if (raw && Array.isArray(raw.items) && map.has(raw.label)) {
        map.set(raw.label, raw.items);
      }
    }
  }
  return map;
}

function transformData(raw) {
  const sectionMap = buildSectionMap(raw.sections);
  const orderedSections = [];
  let globalIndex = 1;

  for (const section of SECTIONS) {
    const items = sectionMap.get(section.title) || [];
    const validItems = items.filter(item => item && item.title);
    orderedSections.push({
      ...section,
      items: validItems,
      startIndex: globalIndex
    });
    globalIndex += validItems.length;
  }

  return {
    date: raw.date || '',
    generatedAt: raw.generatedAt || '',
    isFallback: raw.isFallback || false,
    sections: orderedSections,
    total: globalIndex - 1
  };
}

function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderHero(data) {
  const dateText = data.date ? formatBeijingDate(data.date) : '未知日期';
  const fallbackBadge = data.isFallback && data.date
    ? `<br><span class="hero-fallback">今日日报尚未生成，展示最近一期：${escapeHtml(data.date)}</span>`
    : '';

  const statsHtml = data.sections.map(s => `
    <div class="stat-card">
      <div class="stat-value">${s.items.length}</div>
      <div class="stat-label">${escapeHtml(s.title)}</div>
    </div>
  `).join('');

  return `
    <p class="hero-date">${escapeHtml(dateText)}${fallbackBadge}</p>
    <p class="hero-count">共 <strong>${data.total}</strong> 条</p>
    <div class="hero-stats">${statsHtml}</div>
  `;
}

function renderNav() {
  return SECTIONS.map(s => `
    <a href="#${s.id}">${escapeHtml(s.title)}</a>
  `).join('');
}

function renderCard(item, number) {
  const summary = escapeHtml(truncateSummary(item.summary || item.description || '', 100));
  const fullSummary = escapeHtml(item.summary || item.description || '');
  const linkUrl = isValidUrl(item.sourceUrl) ? item.sourceUrl : (isValidUrl(item.permalink) ? item.permalink : '');
  const linkHtml = linkUrl
    ? `<a class="card-link" href="${escapeHtml(linkUrl)}" target="_blank" rel="noopener noreferrer">阅读原文 →</a>`
    : '';

  return `
    <article class="card" role="button" tabindex="0" data-title="${escapeHtml(item.title || '')}" data-summary="${fullSummary}" data-source="${escapeHtml(item.sourceName || 'AI HOT')}" data-url="${escapeHtml(linkUrl)}" data-number="${number}">
      <span class="card-number">${number}</span>
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(item.title || '无标题')}</h3>
        <p class="card-summary">${summary}</p>
        <div class="card-meta">
          <span class="chip">${escapeHtml(item.sourceName || 'AI HOT')}</span>
        </div>
        ${linkHtml}
      </div>
    </article>
  `;
}

function renderDashboard(data) {
  return data.sections.map(section => {
    const itemsHtml = section.items.length === 0
      ? `<div class="empty-section">本日暂无相关内容</div>`
      : section.items.map((item, idx) => renderCard(item, section.startIndex + idx)).join('');

    return `
      <section id="${section.id}" class="section">
        <div class="section-header">
          <h2 class="section-title">${escapeHtml(section.title)}</h2>
          <span class="section-count">${section.items.length} 条</span>
        </div>
        <div class="card-grid">${itemsHtml}</div>
      </section>
    `;
  }).join('');
}

function renderFooter(data) {
  const dateLabel = data.isFallback ? `最近一期 ${data.date} · ` : '';
  return `${dateLabel}共 ${data.total} 条 · 数据来源：<a href="https://aihot.virxact.com" target="_blank" rel="noopener noreferrer">AI HOT</a>`;
}

function buildHtml(data) {
  const heroHtml = renderHero(data);
  const navHtml = renderNav();
  const dashboardHtml = renderDashboard(data);
  const footerHtml = renderFooter(data);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI HOT 晨间日报</title>
  <style>
    :root {
      --color-primary: #d32f2f;
      --color-primary-light: #ffebee;
      --color-text: #1a1a1a;
      --color-text-secondary: #5a5a5a;
      --color-text-muted: #888888;
      --color-bg: #f5f6f8;
      --color-card: #ffffff;
      --color-border: #e5e7eb;
      --color-shadow: rgba(0, 0, 0, 0.06);
      --color-shadow-hover: rgba(0, 0, 0, 0.1);
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif;
      --radius: 12px;
      --radius-sm: 8px;
      --max-width: 1440px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }

    body {
      font-family: var(--font-sans);
      background: var(--color-bg);
      color: var(--color-text);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }

    .container {
      max-width: var(--max-width);
      margin: 0 auto;
      padding: 0 16px;
    }

    .hero {
      background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
      border-bottom: 1px solid var(--color-border);
      padding: 48px 0 32px;
      text-align: center;
    }

    .hero h1 {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 8px;
      letter-spacing: -0.5px;
    }

    .hero-date {
      font-size: 1.1rem;
      color: var(--color-text-secondary);
      margin-bottom: 4px;
    }

    .hero-fallback {
      display: inline-block;
      font-size: 0.85rem;
      color: var(--color-primary);
      background: var(--color-primary-light);
      padding: 4px 12px;
      border-radius: 999px;
      margin-top: 6px;
    }

    .hero-count {
      font-size: 1.25rem;
      margin-top: 16px;
      color: var(--color-text);
    }

    .hero-count strong {
      color: var(--color-primary);
      font-size: 1.5rem;
      margin: 0 4px;
    }

    .hero-stats {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 12px;
      margin-top: 24px;
    }

    .stat-card {
      background: var(--color-card);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      padding: 12px 18px;
      min-width: 110px;
      box-shadow: 0 1px 2px var(--color-shadow);
    }

    .stat-card .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--color-primary);
      line-height: 1.2;
    }

    .stat-card .stat-label {
      font-size: 0.8rem;
      color: var(--color-text-secondary);
      margin-top: 2px;
    }

    .anchor-nav {
      position: sticky;
      top: 0;
      z-index: 100;
      background: rgba(245, 246, 248, 0.92);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--color-border);
      padding: 12px 0;
    }

    .anchor-nav .container {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
    }

    .anchor-nav .container::-webkit-scrollbar { display: none; }

    .anchor-nav a {
      flex-shrink: 0;
      display: block;
      padding: 8px 16px;
      border-radius: 999px;
      background: var(--color-card);
      border: 1px solid var(--color-border);
      color: var(--color-text-secondary);
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 500;
      transition: all 0.2s ease;
      white-space: nowrap;
    }

    .anchor-nav a:hover {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }

    .dashboard { padding: 32px 0 48px; }

    .section {
      margin-bottom: 40px;
      scroll-margin-top: 72px;
    }

    .section-header {
      display: flex;
      align-items: baseline;
      gap: 12px;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 2px solid var(--color-border);
    }

    .section-title {
      font-size: 1.4rem;
      font-weight: 700;
      color: var(--color-text);
    }

    .section-count {
      font-size: 0.9rem;
      color: var(--color-text-muted);
      font-weight: 500;
    }

    .card-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
    }

    .card {
      position: relative;
      background: var(--color-card);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: 20px;
      box-shadow: 0 2px 8px var(--color-shadow);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      display: flex;
      gap: 14px;
      cursor: pointer;
    }

    .card:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px var(--color-shadow-hover);
    }

    .card-number {
      flex-shrink: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-primary);
      color: #fff;
      font-size: 0.9rem;
      font-weight: 700;
      border-radius: 50%;
      margin-top: 2px;
    }

    .card-body { flex: 1; min-width: 0; }

    .card-title {
      font-size: 1.05rem;
      font-weight: 600;
      line-height: 1.45;
      margin-bottom: 10px;
      color: var(--color-text);
    }

    .card-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 10px;
      align-items: center;
    }

    .chip {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--color-text-secondary);
      background: #f0f1f3;
      padding: 3px 10px;
      border-radius: 999px;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .card-summary {
      font-size: 0.92rem;
      color: var(--color-text-secondary);
      line-height: 1.6;
      margin-bottom: 14px;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .card-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 0.9rem;
      font-weight: 500;
      color: var(--color-primary);
      text-decoration: none;
      transition: opacity 0.2s ease;
    }

    .card-link:hover {
      opacity: 0.8;
      text-decoration: underline;
    }

    .empty-section {
      color: var(--color-text-muted);
      font-size: 0.95rem;
      padding: 16px;
      background: #fafafa;
      border-radius: var(--radius-sm);
      border: 1px dashed var(--color-border);
    }

    .footer {
      background: #ffffff;
      border-top: 1px solid var(--color-border);
      padding: 24px 0;
      text-align: center;
      color: var(--color-text-muted);
      font-size: 0.9rem;
    }

    .footer a {
      color: var(--color-primary);
      text-decoration: none;
    }

    /* Lightbox Modal */
    .modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgba(245, 246, 248, 0.6);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.3s ease, visibility 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .modal-overlay.active {
      opacity: 1;
      visibility: visible;
    }

    .modal-card {
      background: var(--color-card);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.18);
      width: 100%;
      max-width: 680px;
      max-height: 85vh;
      overflow-y: auto;
      padding: 28px;
      position: relative;
      transform: scale(0.96);
      transition: transform 0.3s ease;
    }

    .modal-overlay.active .modal-card {
      transform: scale(1);
    }

    .modal-close {
      position: absolute;
      top: 14px;
      right: 14px;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--color-border);
      border-radius: 50%;
      background: #fff;
      color: var(--color-text-secondary);
      font-size: 1.4rem;
      line-height: 1;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .modal-close:hover {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }

    .modal-number {
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-primary);
      color: #fff;
      font-size: 1rem;
      font-weight: 700;
      border-radius: 50%;
      margin-bottom: 14px;
    }

    .modal-title {
      font-size: 1.3rem;
      font-weight: 700;
      line-height: 1.45;
      margin-bottom: 14px;
      color: var(--color-text);
    }

    .modal-summary {
      font-size: 1rem;
      color: var(--color-text-secondary);
      line-height: 1.75;
      margin-bottom: 18px;
      white-space: pre-wrap;
    }

    .modal-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 18px;
    }

    .modal-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 0.95rem;
      font-weight: 500;
      color: var(--color-primary);
      text-decoration: none;
    }

    .modal-link:hover {
      text-decoration: underline;
    }

    body.modal-open .hero,
    body.modal-open .anchor-nav,
    body.modal-open .dashboard,
    body.modal-open .footer {
      filter: blur(3px) grayscale(0.2);
      opacity: 0.45;
      transition: filter 0.3s ease, opacity 0.3s ease;
      pointer-events: none;
    }

    @media (min-width: 640px) {
      .hero h1 { font-size: 2.5rem; }
      .hero-date { font-size: 1.2rem; }
      .card-grid { grid-template-columns: repeat(2, 1fr); }
    }

    @media (min-width: 1024px) {
      .container { padding: 0 24px; }
      .hero { padding: 64px 0 40px; }
      .card-grid { grid-template-columns: repeat(3, 1fr); }
    }

    @media (min-width: 1440px) {
      .card-grid { grid-template-columns: repeat(4, 1fr); }
    }

    @media (max-width: 359px) {
      .hero h1 { font-size: 1.6rem; }
      .stat-card { min-width: 90px; padding: 10px 12px; }
      .stat-card .stat-value { font-size: 1.25rem; }
    }
  </style>
</head>
<body>
  <header class="hero">
    <div class="container">
      <h1>AI HOT 晨间日报</h1>
      ${heroHtml}
    </div>
  </header>

  <nav class="anchor-nav" aria-label="版块导航">
    <div class="container">${navHtml}</div>
  </nav>

  <main class="dashboard">
    <div class="container">
      ${dashboardHtml}
    </div>
  </main>

  <footer class="footer">
    <div class="container">
      <p>${footerHtml}</p>
    </div>
  </footer>

  <div class="modal-overlay" id="modal-overlay" aria-hidden="true">
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button class="modal-close" id="modal-close" aria-label="关闭">×</button>
      <div class="modal-number" id="modal-number"></div>
      <h3 class="modal-title" id="modal-title"></h3>
      <p class="modal-summary" id="modal-summary"></p>
      <div class="modal-meta">
        <span class="chip" id="modal-source"></span>
      </div>
      <a class="modal-link" id="modal-link" href="#" target="_blank" rel="noopener noreferrer">阅读原文 →</a>
    </div>
  </div>

  <script>
    (function () {
      'use strict';
      const overlay = document.getElementById('modal-overlay');
      const closeBtn = document.getElementById('modal-close');
      const modalNumber = document.getElementById('modal-number');
      const modalTitle = document.getElementById('modal-title');
      const modalSummary = document.getElementById('modal-summary');
      const modalSource = document.getElementById('modal-source');
      const modalLink = document.getElementById('modal-link');

      function openModal(card) {
        const title = card.dataset.title || '无标题';
        const summary = card.dataset.summary || '';
        const source = card.dataset.source || 'AI HOT';
        const url = card.dataset.url || '';
        const number = card.dataset.number || '';

        modalNumber.textContent = number;
        modalTitle.textContent = title;
        modalSummary.textContent = summary;
        modalSource.textContent = source;

        if (url) {
          modalLink.href = url;
          modalLink.style.display = 'inline-flex';
        } else {
          modalLink.style.display = 'none';
        }

        document.body.classList.add('modal-open');
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
        closeBtn.focus();
      }

      function closeModal() {
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
      }

      document.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', () => openModal(card));
        card.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openModal(card);
          }
        });
      });

      closeBtn.addEventListener('click', closeModal);
      overlay.addEventListener('click', e => {
        if (e.target === overlay) closeModal();
      });
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && overlay.classList.contains('active')) {
          closeModal();
        }
      });
    })();
  </script>
</body>
</html>`;
}

async function main() {
  try {
    const raw = await loadData();
    const data = transformData(raw);
    const html = buildHtml(data);
    const outputPath = process.argv[2] || path.join(__dirname, 'index.html');
    fs.writeFileSync(outputPath, html, 'utf8');
    console.log(`Generated: ${outputPath}`);
    console.log(`Date: ${data.date}, Total: ${data.total}, Fallback: ${data.isFallback}`);
  } catch (err) {
    console.error('Failed to generate dashboard:', err.message);
    process.exit(1);
  }
}

main();
