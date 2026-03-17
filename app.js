/**
 * Video Generation Survey - App Logic
 * Data source: GitHub raw files from auto202603/video-generation-survey
 */

// ===================== CONFIG =====================
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/yzhang2016/video-generation-survey/main/';
const CACHE_KEY = 'vgs_data_v6';
const CACHE_TS_KEY = 'vgs_last_updated';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const STARS_CACHE_KEY = 'vgs_stars_v1'; // repo -> starCount map

const CATEGORIES = [
  {
    id: 'vg',
    name: 'Video Generation',
    icon: '📹',
    file: 'video-generation.md',
    tagClass: 'tag-vg',
  },
  {
    id: 'eid',
    name: 'Editing in Diffusion',
    icon: '🎨',
    file: 'Editing-in-Diffusion.md',
    tagClass: 'tag-eid',
  },
  {
    id: 'mmg',
    name: 'Multi-modality Generation',
    icon: '🤖',
    file: 'Multi-modality Generation.md',
    tagClass: 'tag-mmg',
  },
  {
    id: 'vh',
    name: 'Virtual Human',
    icon: '👤',
    file: 'virtual_human.md',
    tagClass: 'tag-vh',
  },
];

// ===================== STATE =====================
let allPapers = []; // { id, title, date, dateNum, category, catId, tagClass, subsection, pdfUrl, pageUrl, starBadgeUrl, starRepo, stars }
let subsectionsMap = {}; // catId -> [{name, count}]
let activeCats = new Set();   // selected category ids
let activeSubsections = new Set(); // "catId::subsection"
let searchQuery = '';
let sortMode = 'date_desc';
let starCacheMap = {}; // repo -> starCount, loaded from localStorage

// ===================== PARSE MD =====================
function parseMd(text, category) {
  const papers = [];
  const subsections = [];
  let currentSubsection = 'General';

  const lines = text.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Subsection heading (## ...)
    if (/^##\s+/.test(line)) {
      currentSubsection = line.replace(/^##\s+/, '').trim();
      if (!subsections.includes(currentSubsection)) {
        subsections.push(currentSubsection);
      }
      continue;
    }

    // Paper line - must have [arxiv ...] or similar date tag
    // Pattern: [arxiv YYYY.MM] Title ... [[PDF](url)] optional star badge
    const dateMatch = line.match(/\[arxiv\s+(\d{4}\.\d{2})\]/i);
    if (!dateMatch) continue;

    const dateStr = dateMatch[1]; // e.g. "2026.03"
    const dateNum = parseInt(dateStr.replace('.', ''), 10); // 202603

    // Remove date tag from line to get rest
    let rest = line.replace(/\[arxiv\s+\d{4}\.\d{2}\]\s*/i, '').trim();

    // Extract PDF link
    let pdfUrl = '';
    const pdfMatch = rest.match(/\[PDF\]\(([^)]+)\)/i);
    if (pdfMatch) pdfUrl = pdfMatch[1].trim();

    // Extract Page link
    let pageUrl = '';
    const pageMatch = rest.match(/\[Page\]\(([^)]*)\)/i);
    if (pageMatch) pageUrl = pageMatch[1].trim();

    // Extract star badge URL
    let starBadgeUrl = '';
    let starRepo = '';
    const starMatch = rest.match(/!\[(?:Code|Star)\]\((https:\/\/img\.shields\.io\/github\/stars\/([^?)]+)[^)]*)\)/i);
    if (starMatch) {
      starBadgeUrl = starMatch[1];
      starRepo = starMatch[2]; // owner/repo
    }

    // Extract title: remove all link/badge markdown, get text
    let title = rest
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // remove images
      .replace(/\[\[([^\]]*)\]\([^)]*\)(?:,\s*\[([^\]]*)\]\([^)]*\))*\]/g, '') // remove [[PDF](),[Page]()] block
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // keep link text
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/^\s*[-*]\s*/, '')
      .trim();

    // Skip empty or placeholder lines
    if (!title || title.length < 2) continue;
    // Skip lines that are just URLs or single words
    if (/^https?:\/\//.test(title)) continue;
    // Skip placeholder lines like "   [[PDF](),[Page]()] ..."
    if (title.startsWith('[[') || title.length < 3) continue;

    // Also skip lines where pdfUrl is empty and pageUrl is empty and no title content
    if (!pdfUrl && !pageUrl && title.length < 4) continue;

    papers.push({
      id: `${category.id}_${papers.length}`,
      title,
      date: dateStr,
      dateNum,
      category: category.name,
      catId: category.id,
      tagClass: category.tagClass,
      subsection: currentSubsection,
      pdfUrl,
      pageUrl,
      starBadgeUrl,
      starRepo,
      stars: 0, // will be resolved from starCacheMap at render time
    });
  }

  return { papers, subsections };
}

// ===================== FETCH DATA =====================
async function fetchAllData(forceRefresh = false) {
  // Load stars cache into memory
  try {
    const sc = localStorage.getItem(STARS_CACHE_KEY);
    if (sc) starCacheMap = JSON.parse(sc);
  } catch(e) { starCacheMap = {}; }

  // Try cache first
  if (!forceRefresh) {
    const cached = localStorage.getItem(CACHE_KEY);
    const ts = localStorage.getItem(CACHE_TS_KEY);
    if (cached && ts && (Date.now() - parseInt(ts, 10)) < CACHE_TTL_MS) {
      try {
        const data = JSON.parse(cached);
        // Resolve stars from starCacheMap
        for (const p of data.papers) {
          if (p.starRepo && starCacheMap[p.starRepo] !== undefined) {
            p.stars = starCacheMap[p.starRepo];
          }
        }
        return data;
      } catch (e) {
        // cache corrupt, fall through
      }
    }
  }

  // Fetch from GitHub
  const results = { papers: [], subsectionsMap: {} };
  setProgress(0);

  for (let i = 0; i < CATEGORIES.length; i++) {
    const cat = CATEGORIES[i];
    try {
      const url = GITHUB_RAW_BASE + encodeURIComponent(cat.file);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      const { papers, subsections } = parseMd(text, cat);
      results.papers.push(...papers);
      results.subsectionsMap[cat.id] = subsections;
    } catch (e) {
      console.warn(`Failed to fetch ${cat.file}:`, e);
    }
    setProgress(Math.round(((i + 1) / CATEGORIES.length) * 100));
  }

  // Fetch GitHub stars (only on forceRefresh/Sync).
  // Results go into starCacheMap (persisted separately) and are also
  // applied to papers.stars so sorting works immediately after sync.
  await fetchStarsForPapers(results.papers);

  // Cache
  localStorage.setItem(CACHE_KEY, JSON.stringify(results));
  localStorage.setItem(CACHE_TS_KEY, String(Date.now()));

  return results;
}

// Fetch GitHub star counts via GitHub API.
// Called ONLY on Sync (forceRefresh=true).
// 1. Fetches all unique repos in batches
// 2. Updates global starCacheMap and persists to localStorage
// 3. Applies star counts to papers.stars (integer) so sorting works immediately
async function fetchStarsForPapers(papers) {
  const repos = [...new Set(papers.filter(p => p.starRepo).map(p => p.starRepo))];
  const fetched = {};
  const BATCH = 15;
  let rateLimited = false;

  for (let i = 0; i < repos.length; i += BATCH) {
    if (rateLimited) break;
    const batch = repos.slice(i, i + BATCH);
    await Promise.allSettled(batch.map(async repo => {
      try {
        const resp = await fetch(`https://api.github.com/repos/${repo}`, {
          headers: { 'Accept': 'application/vnd.github.v3+json' }
        });
        if (resp.ok) {
          const data = await resp.json();
          const count = data.stargazers_count;
          if (typeof count === 'number') fetched[repo] = count;
        } else if (resp.status === 403 || resp.status === 429) {
          rateLimited = true;
          console.warn('GitHub API rate limited at:', repo);
        }
      } catch (e) { /* ignore network errors */ }
    }));
    if (i + BATCH < repos.length) await new Promise(r => setTimeout(r, 250));
  }

  // Merge into global starCacheMap and persist
  Object.assign(starCacheMap, fetched);
  try {
    localStorage.setItem(STARS_CACHE_KEY, JSON.stringify(starCacheMap));
  } catch(e) { console.warn('Could not save stars cache', e); }

  // Apply to papers (integer, not -1)
  for (const p of papers) {
    if (p.starRepo && starCacheMap[p.starRepo] !== undefined) {
      p.stars = starCacheMap[p.starRepo]; // guaranteed integer >= 0
    }
  }

  const total = repos.length;
  const got = Object.keys(fetched).length;
  console.log(`Stars: fetched ${got}/${total} repos${rateLimited ? ' (rate limited)' : ''}`);
  if (got < total) console.log(`Stars: ${total - got} repos missing (no badge or API error)`);
}

// ===================== RENDER =====================
function buildSidebar() {
  const sidebar = document.getElementById('sidebar');

  let html = `<div class="sidebar-section-title">Categories</div>`;

  for (const cat of CATEGORIES) {
    const count = allPapers.filter(p => p.catId === cat.id).length;
    const isActive = activeCats.has(cat.id);
    const subs = subsectionsMap[cat.id] || [];

    html += `
      <button class="category-btn ${isActive ? 'active' : ''}" data-cat="${cat.id}" onclick="toggleCategory('${cat.id}')">
        <span>${cat.icon}</span>
        <span style="flex:1">${cat.name}</span>
        <span class="cat-count">${count}</span>
      </button>
      <div class="subsection-list ${isActive ? 'open' : ''}" id="sub-list-${cat.id}">
    `;

    if (subs.length > 0) {
      const subPapers = allPapers.filter(p => p.catId === cat.id);
      for (const sub of subs) {
        const key = `${cat.id}::${sub}`;
        const isSubActive = activeSubsections.has(key);
        const subCount = subPapers.filter(p => p.subsection === sub).length;
        if (subCount === 0) continue;
        html += `
          <button class="subsection-btn ${isSubActive ? 'active' : ''}" 
                  data-key="${key}" onclick="toggleSubsection('${key}')">
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${sub}</span>
            <span class="sub-count">${subCount}</span>
          </button>
        `;
      }
    }

    html += `</div>`;
  }

  sidebar.innerHTML = html;
}

function getFilteredPapers() {
  let papers = allPapers;

  // Category filter
  if (activeCats.size > 0) {
    papers = papers.filter(p => activeCats.has(p.catId));
  }

  // Subsection filter
  if (activeSubsections.size > 0) {
    papers = papers.filter(p => activeSubsections.has(`${p.catId}::${p.subsection}`));
  }

  // Search filter
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    papers = papers.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.subsection.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  }

  // Sort
  papers = [...papers];
  if (sortMode === 'date_desc') {
    papers.sort((a, b) => b.dateNum - a.dateNum);
  } else if (sortMode === 'date_asc') {
    papers.sort((a, b) => a.dateNum - b.dateNum);
  } else if (sortMode === 'stars_desc') {
    papers.sort((a, b) => {
      // stars > 0: has real data; stars = 0 + no starRepo: no badge
      // stars = 0 + has starRepo: either 0 stars or not yet fetched → treat as unknown, sort to bottom
      const sa = (a.starRepo && a.stars > 0) ? a.stars : -1;
      const sb = (b.starRepo && b.stars > 0) ? b.stars : -1;
      if (sa === -1 && sb === -1) return 0;
      if (sa === -1) return 1;  // a goes after b
      if (sb === -1) return -1; // b goes after a
      return sb - sa; // both positive: descending
    });
  }

  return papers;
}

function renderPaperCard(p) {
  const catInfo = CATEGORIES.find(c => c.id === p.catId);
  const catIcon = catInfo ? catInfo.icon : '';

  let linksHtml = '';
  if (p.pdfUrl) {
    linksHtml += `<a href="${escHtml(p.pdfUrl)}" class="link-btn pdf" target="_blank" rel="noopener">📄 PDF</a>`;
  }
  if (p.pageUrl) {
    linksHtml += `<a href="${escHtml(p.pageUrl)}" class="link-btn page" target="_blank" rel="noopener">🔗 Page</a>`;
  }
  if (p.starBadgeUrl) {
    const repoUrl = p.starRepo ? `https://github.com/${p.starRepo}` : '#';
    linksHtml += `<a href="${escHtml(repoUrl)}" target="_blank" rel="noopener">
      <img class="star-badge" src="${escHtml(p.starBadgeUrl)}" alt="GitHub Stars" loading="lazy">
    </a>`;
  }

  return `
    <div class="paper-card" id="card-${p.id}">
      <div class="paper-header">
        <div class="paper-title">${escHtml(p.title)}</div>
        <div class="paper-date">arxiv ${escHtml(p.date)}</div>
      </div>
      <div class="paper-meta">
        <span class="tag ${p.tagClass}">${catIcon} ${escHtml(p.category)}</span>
        <span class="tag tag-sub">§ ${escHtml(p.subsection)}</span>
      </div>
      <div class="paper-links">
        ${linksHtml}
      </div>
    </div>
  `;
}

function renderPapers() {
  const filtered = getFilteredPapers();
  const container = document.getElementById('paperList');
  const countEl = document.getElementById('resultsCount');

  countEl.innerHTML = `Showing <strong>${filtered.length}</strong> papers${allPapers.length !== filtered.length ? ` of ${allPapers.length}` : ''}`;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="state-box">
        <div class="state-icon">🔍</div>
        <p>No papers found</p>
        <small>Try adjusting filters or search query</small>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(renderPaperCard).join('');
}



// ===================== FILTERS =====================
function toggleCategory(catId) {
  if (activeCats.has(catId)) {
    activeCats.delete(catId);
    // Remove subsections for this cat
    for (const key of [...activeSubsections]) {
      if (key.startsWith(catId + '::')) activeSubsections.delete(key);
    }
  } else {
    activeCats.add(catId);
  }
  buildSidebar();
  renderPapers();
}

function toggleSubsection(key) {
  if (activeSubsections.has(key)) {
    activeSubsections.delete(key);
  } else {
    activeSubsections.add(key);
  }
  buildSidebar();
  renderPapers();
}

// ===================== SEARCH / SORT =====================
let searchTimer = null;
function onSearch(val) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchQuery = val.trim();
    renderPapers();
  }, 200);
}

function onSortChange(val) {
  sortMode = val;
  renderPapers();
}

// ===================== SYNC =====================
function setProgress(pct) {
  const bar = document.querySelector('.sync-progress-bar');
  const wrap = document.querySelector('.sync-progress');
  if (!wrap) return;
  if (pct <= 0) {
    wrap.style.display = 'block';
    bar.style.width = '0%';
  } else if (pct >= 100) {
    bar.style.width = '100%';
    setTimeout(() => { wrap.style.display = 'none'; }, 600);
  } else {
    bar.style.width = pct + '%';
  }
}

async function syncFromGitHub(forceRefresh = true) {
  const btn = document.getElementById('syncBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Syncing...'; }

  showLoading();

  try {
    const data = await fetchAllData(forceRefresh);
    allPapers = data.papers;
    subsectionsMap = data.subsectionsMap;

    buildSidebar();
    renderPapers();
    updateLastUpdated();
    const starsCount = Object.keys(starCacheMap).length;
    showToast(`✅ Synced! ${allPapers.length} papers, ${starsCount} repos with stars.`);
  } catch (e) {
    showToast('❌ Sync failed: ' + e.message);
    console.error(e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Sync from GitHub'; }
    setProgress(100);
  }
}

function showLoading() {
  document.getElementById('paperList').innerHTML = `
    <div class="state-box">
      <div class="spinner"></div>
      <p>Loading papers...</p>
      <small>Fetching from GitHub</small>
    </div>
  `;
  document.getElementById('resultsCount').textContent = '';
}

function updateLastUpdated() {
  const ts = localStorage.getItem(CACHE_TS_KEY);
  const el = document.getElementById('lastUpdated');
  if (!el) return;
  if (ts) {
    const d = new Date(parseInt(ts, 10));
    el.textContent = 'Updated: ' + d.toLocaleString();
  }
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===================== INIT =====================
async function init() {
  updateLastUpdated();

  // Try cache first (no force refresh on load)
  const cached = localStorage.getItem(CACHE_KEY);
  const ts = localStorage.getItem(CACHE_TS_KEY);
  const cacheAge = ts ? Date.now() - parseInt(ts, 10) : Infinity;

  if (cached && cacheAge < CACHE_TTL_MS) {
    try {
      const data = JSON.parse(cached);
      allPapers = data.papers;
      subsectionsMap = data.subsectionsMap;
      buildSidebar();
      renderPapers();
      updateLastUpdated();
      return;
    } catch (e) {
      // fall through to fresh fetch
    }
  }

  // Fresh fetch
  await syncFromGitHub(false);
}

// Kick off on page load
window.addEventListener('DOMContentLoaded', init);
